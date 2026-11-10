//! O lado nativo e pequeno de proposito: primitivas de disco presas a pasta do
//! vault, um watcher que avisa a webview quando algo muda (o MCP escreve direto
//! nos arquivos) e o protocolo `mocha://`, que serve os HTML dos blends para os
//! iframes. A logica do vault mora no `@mocha/core`, que o MCP tambem usa.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{mpsc, Mutex},
    time::{Duration, Instant, UNIX_EPOCH},
};

use notify::{
    event::{AccessKind, AccessMode},
    Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use tauri::{
    http,
    ipc::{InvokeBody, Request, Response},
    path::BaseDirectory,
    AppHandle, Emitter, Manager, State,
};

type CmdResult<T> = Result<T, String>;

#[derive(Default)]
struct AppState {
    vault: Mutex<Option<PathBuf>>,
    // Guardado so para nao ser derrubado: o watcher para quando sai de escopo.
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Serialize, Deserialize, Default)]
struct Config {
    vault: Option<String>,
}

#[derive(Serialize)]
struct Entry {
    name: String,
    dir: bool,
    mtime: f64,
    size: u64,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn config_path(app: &AppHandle) -> CmdResult<PathBuf> {
    Ok(app.path().app_config_dir().map_err(err)?.join("config.json"))
}

fn load_config(app: &AppHandle) -> Config {
    config_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config(app: &AppHandle, config: &Config) -> CmdResult<()> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(path, serde_json::to_string_pretty(config).map_err(err)?).map_err(err)
}

fn root(state: &AppState) -> CmdResult<PathBuf> {
    state
        .vault
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "vault nao configurado".into())
}

/// Caminho relativo ao vault, sem `..` nem raiz: nada aqui sai da pasta.
fn resolve(root: &Path, rel: &str) -> CmdResult<PathBuf> {
    let mut out = root.to_path_buf();
    for seg in rel.split(['/', '\\']) {
        match seg {
            "" | "." => continue,
            ".." => return Err(format!("caminho nao pode subir de pasta: {rel}")),
            s if s.contains(':') => return Err(format!("caminho invalido: {rel}")),
            s => out.push(s),
        }
    }
    Ok(out)
}

fn path_in(state: &AppState, rel: &str) -> CmdResult<PathBuf> {
    resolve(&root(state)?, rel)
}

fn ensure_parent(path: &Path) -> CmdResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    Ok(())
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_dir(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ())
    }
}

/// Muda algo no disco -> evento `vault:changed` com os caminhos relativos,
/// agrupados em janelas de 120ms (salvar um arquivo gera varios eventos).
fn start_watcher(app: &AppHandle, root: &Path) -> CmdResult<RecommendedWatcher> {
    let (tx, rx) = mpsc::channel::<PathBuf>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        // O inotify tambem avisa quando um arquivo so e aberto para leitura. Sem
        // este filtro, mostrar o blend (que le o arquivo) contaria como mudanca,
        // recarregaria o iframe, leria de novo, e assim em laco.
        if let EventKind::Access(kind) = event.kind {
            if kind != AccessKind::Close(AccessMode::Write) {
                return;
            }
        }
        for path in event.paths {
            let _ = tx.send(path);
        }
    })
    .map_err(err)?;
    watcher.watch(root, RecursiveMode::Recursive).map_err(err)?;

    let app = app.clone();
    let base = root.to_path_buf();
    // A thread acaba sozinha quando o watcher cai (troca de vault): o `tx` vai
    // junto e o `recv` devolve erro.
    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let started = Instant::now();
            let mut batch = vec![first];
            while started.elapsed() < Duration::from_secs(1) {
                match rx.recv_timeout(Duration::from_millis(120)) {
                    Ok(path) => batch.push(path),
                    Err(_) => break,
                }
            }
            let mut paths: Vec<String> = batch
                .iter()
                .filter_map(|p| p.strip_prefix(&base).ok())
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .filter(|p| !p.is_empty())
                .collect();
            paths.sort();
            paths.dedup();
            if !paths.is_empty() {
                let _ = app.emit("vault:changed", paths);
            }
        }
    });
    Ok(watcher)
}

fn open_vault(app: &AppHandle, state: &AppState, path: &Path) -> CmdResult<PathBuf> {
    fs::create_dir_all(path.join("ideias")).map_err(err)?;
    // Canonico porque o watcher devolve caminhos canonicos, e o `strip_prefix`
    // falharia se a pasta escolhida passasse por um symlink.
    let canonical = fs::canonicalize(path).map_err(err)?;
    let watcher = start_watcher(app, &canonical)?;
    *state.vault.lock().unwrap() = Some(canonical.clone());
    *state.watcher.lock().unwrap() = Some(watcher);
    Ok(canonical)
}

// ------------------------------------------------------------------ vault

#[tauri::command]
fn vault_get(state: State<'_, AppState>) -> Option<String> {
    state
        .vault
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn vault_default(app: AppHandle) -> CmdResult<String> {
    let home = app.path().home_dir().map_err(err)?;
    Ok(home.join("Mocha").to_string_lossy().into_owned())
}

#[tauri::command]
fn vault_set(app: AppHandle, state: State<'_, AppState>, path: String) -> CmdResult<String> {
    let canonical = open_vault(&app, &state, Path::new(&path))?;
    let vault = canonical.to_string_lossy().into_owned();
    save_config(&app, &Config { vault: Some(vault.clone()) })?;
    Ok(vault)
}

/// O servidor MCP vai junto no pacote, como recurso; o agente roda ele com node.
#[tauri::command]
fn mcp_entry(app: AppHandle) -> Option<String> {
    app.path()
        .resolve("mcp/mocha-mcp.js", BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().into_owned())
}

// ------------------------------------------------------------------- disco
// `async` para rodar fora da thread principal: comando sincrono no Tauri
// trava a janela enquanto o disco responde.

#[tauri::command]
async fn fs_read_text(state: State<'_, AppState>, path: String) -> CmdResult<String> {
    fs::read_to_string(path_in(&state, &path)?).map_err(err)
}

#[tauri::command]
async fn fs_read_bytes(state: State<'_, AppState>, path: String) -> CmdResult<Response> {
    Ok(Response::new(fs::read(path_in(&state, &path)?).map_err(err)?))
}

#[tauri::command]
async fn fs_write_text(state: State<'_, AppState>, path: String, content: String) -> CmdResult<()> {
    let target = path_in(&state, &path)?;
    ensure_parent(&target)?;
    fs::write(target, content).map_err(err)
}

/// Corpo cru em vez de JSON: imagem colada no briefing passaria como array de
/// numeros, quatro vezes maior. O caminho vem no cabecalho `x-path`.
#[tauri::command]
async fn fs_write_bytes(state: State<'_, AppState>, request: Request<'_>) -> CmdResult<()> {
    let header = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .ok_or("falta o cabecalho x-path")?;
    let rel = percent_decode_str(header).decode_utf8_lossy();
    let InvokeBody::Raw(data) = request.body() else {
        return Err("corpo precisa ser binario".into());
    };
    let target = path_in(&state, &rel)?;
    ensure_parent(&target)?;
    fs::write(target, data).map_err(err)
}

#[tauri::command]
async fn fs_list(state: State<'_, AppState>, path: String) -> CmdResult<Vec<Entry>> {
    let dir = path_in(&state, &path)?;
    let read = match fs::read_dir(&dir) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(err(e)),
    };
    let mut entries = vec![];
    for item in read.flatten() {
        let Ok(meta) = fs::metadata(item.path()) else { continue };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as f64)
            .unwrap_or(0.0);
        entries.push(Entry {
            name: item.file_name().to_string_lossy().into_owned(),
            dir: meta.is_dir(),
            mtime,
            size: meta.len(),
        });
    }
    Ok(entries)
}

#[tauri::command]
async fn fs_exists(state: State<'_, AppState>, path: String) -> CmdResult<bool> {
    Ok(path_in(&state, &path)?.exists())
}

#[tauri::command]
async fn fs_mkdir(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    fs::create_dir_all(path_in(&state, &path)?).map_err(err)
}

#[tauri::command]
async fn fs_rename(state: State<'_, AppState>, from: String, to: String) -> CmdResult<()> {
    let target = path_in(&state, &to)?;
    ensure_parent(&target)?;
    fs::rename(path_in(&state, &from)?, target).map_err(err)
}

#[tauri::command]
async fn fs_copy(state: State<'_, AppState>, from: String, to: String) -> CmdResult<()> {
    let target = path_in(&state, &to)?;
    if target.exists() {
        return Err(format!("ja existe: {to}"));
    }
    copy_dir(&path_in(&state, &from)?, &target).map_err(err)
}

#[tauri::command]
async fn fs_remove(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let target = path_in(&state, &path)?;
    if target == root(&state)? {
        return Err("nao da para remover o vault".into());
    }
    match fs::metadata(&target) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(target).map_err(err),
        Ok(_) => fs::remove_file(target).map_err(err),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(err(e)),
    }
}

// ----------------------------------------------------------- mocha://
//
// `mocha://localhost/<caminho>` serve o vault inteiro para o app (imagens do
// briefing, assets). `mocha://v<n>.<slug em hex>/<arquivo>` serve uma versao de
// blend so: cada versao e uma origem propria. O iframe precisa de
// `allow-same-origin` para o WebKitGTK carregar o tokens.css e os assets da
// tela (com origem opaca ele recusa), e com a origem presa a versao o HTML de
// um agente ainda nao le o resto do vault nem alcanca o app.

fn decode_hex(hex: &str) -> Option<String> {
    if hex.len() % 2 != 0 {
        return None;
    }
    let bytes = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(hex.get(i..i + 2)?, 16).ok())
        .collect::<Option<Vec<u8>>>()?;
    String::from_utf8(bytes).ok()
}

fn serve_root(vault: &Path, host: &str) -> CmdResult<PathBuf> {
    // No Windows o WebView2 entrega tudo como http://mocha.localhost.
    if host.is_empty() || host == "localhost" || host == "mocha.localhost" {
        return Ok(vault.to_path_buf());
    }
    let mut labels = host.split('.');
    let version = labels
        .next()
        .and_then(|v| v.strip_prefix('v'))
        .and_then(|n| n.parse::<u32>().ok())
        .ok_or("host invalido")?;
    let slug = decode_hex(&labels.collect::<String>()).ok_or("host invalido")?;
    resolve(vault, &format!("ideias/{slug}/blends/v{version}"))
}

fn serve(app: &AppHandle, request: &http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let respond = |status: u16, mime: &str, body: Vec<u8>| {
        http::Response::builder()
            .status(status)
            .header("Content-Type", mime)
            .header("Cache-Control", "no-store")
            .body(body)
            .unwrap()
    };
    let state = app.state::<AppState>();
    let rel = percent_decode_str(request.uri().path()).decode_utf8_lossy().into_owned();
    let host = request.uri().host().unwrap_or_default();
    let Ok(mut path) = root(&state)
        .and_then(|vault| serve_root(&vault, host))
        .and_then(|base| resolve(&base, &rel))
    else {
        return respond(400, "text/plain", b"caminho invalido".to_vec());
    };
    if path.is_dir() {
        path.push("index.html");
    }
    match fs::read(&path) {
        Ok(body) => {
            let guess = mime_guess::from_path(&path).first_or_octet_stream();
            let mime = if guess.type_() == "text" || guess.subtype() == "javascript" || guess.subtype() == "json" {
                format!("{guess}; charset=utf-8")
            } else {
                guess.to_string()
            };
            respond(200, &mime, body)
        }
        Err(_) => respond(404, "text/plain", b"nao encontrado".to_vec()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .register_asynchronous_uri_scheme_protocol("mocha", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            std::thread::spawn(move || responder.respond(serve(&app, &request)));
        })
        .setup(|app| {
            let handle = app.handle().clone();
            if let Some(vault) = load_config(&handle).vault {
                let state = handle.state::<AppState>();
                if let Err(e) = open_vault(&handle, &state, Path::new(&vault)) {
                    eprintln!("mocha: nao abriu o vault {vault}: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_get,
            vault_default,
            vault_set,
            mcp_entry,
            fs_read_text,
            fs_read_bytes,
            fs_write_text,
            fs_write_bytes,
            fs_list,
            fs_exists,
            fs_mkdir,
            fs_rename,
            fs_copy,
            fs_remove,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o mocha");
}

#[cfg(test)]
mod tests {
    use super::{resolve, serve_root};
    use std::path::Path;

    #[test]
    fn resolve_fica_dentro_do_vault() {
        let root = Path::new("/vault");
        assert_eq!(resolve(root, "").unwrap(), root);
        assert_eq!(resolve(root, "ideias/a/briefing/x.md").unwrap(), root.join("ideias/a/briefing/x.md"));
        assert_eq!(resolve(root, "./ideias//a").unwrap(), root.join("ideias/a"));
        assert!(resolve(root, "../etc/passwd").is_err());
        assert!(resolve(root, "ideias/../../x").is_err());
        assert!(resolve(root, "ideias\\..\\..\\x").is_err());
        assert!(resolve(root, "C:/Windows").is_err());
        // Barra inicial e ignorada: o caminho continua relativo ao vault.
        assert_eq!(resolve(root, "/ideias").unwrap(), root.join("ideias"));
    }

    #[test]
    fn host_de_blend_vira_a_pasta_da_versao() {
        let root = Path::new("/vault");
        assert_eq!(serve_root(root, "localhost").unwrap(), root);
        assert_eq!(serve_root(root, "mocha.localhost").unwrap(), root);
        // "cafe" em hex
        assert_eq!(serve_root(root, "v2.63616665").unwrap(), root.join("ideias/cafe/blends/v2"));
        // slug longo quebrado em varios rotulos
        assert_eq!(serve_root(root, "v1.6361.6665").unwrap(), root.join("ideias/cafe/blends/v1"));
        // ".." em hex
        assert!(serve_root(root, "v1.2e2e").is_err());
        assert!(serve_root(root, "x1.6361").is_err());
        assert!(serve_root(root, "v1.zz").is_err());
    }
}
