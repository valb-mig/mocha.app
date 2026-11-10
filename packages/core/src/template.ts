import type { Tokens } from './schema.ts'

/** Tokens da primeira versao de um blend criado do zero. */
export const STARTER_TOKENS: Tokens = {
  colors: [
    { name: 'bg', value: '#14110f', group: 'base' },
    { name: 'surface', value: '#1f1a17', group: 'base' },
    { name: 'border', value: '#3a322c', group: 'base' },
    { name: 'text', value: '#f2ebe1', group: 'base' },
    { name: 'muted', value: '#a39486', group: 'base' },
    { name: 'primary', value: '#d08a4e', group: 'acento' },
    { name: 'on-primary', value: '#1a120c', group: 'acento' },
  ],
  fonts: [
    { name: 'heading', family: 'Fraunces', fallback: 'serif', weights: [400, 600], source: 'google' },
    { name: 'body', family: 'Inter', fallback: 'system-ui, sans-serif', weights: [400, 500, 600], source: 'google' },
  ],
  radii: [
    { name: 'sm', value: '6px' },
    { name: 'md', value: '10px' },
  ],
  spacing: [
    { name: '1', value: '4px' },
    { name: '2', value: '8px' },
    { name: '3', value: '12px' },
    { name: '4', value: '16px' },
    { name: '6', value: '24px' },
    { name: '8', value: '32px' },
  ],
  shadows: [{ name: 'card', value: '0 1px 2px rgb(0 0 0 / 0.35)' }],
}

export function starterScreen(title: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="tokens.css">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--color-bg);
      color: var(--color-text);
      font-family: var(--font-body);
      padding: var(--space-8);
    }
    h1 { font-family: var(--font-heading); font-weight: 600; font-size: 40px; margin: 0 0 var(--space-2); }
    .muted { color: var(--color-muted); }
    .row { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; margin-top: var(--space-6); }
    .btn {
      font: inherit; font-weight: 500; border: 0; cursor: pointer;
      padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm);
      background: var(--color-primary); color: var(--color-on-primary);
    }
    .btn.ghost { background: transparent; color: var(--color-text); outline: 1px solid var(--color-border); }
    .card {
      margin-top: var(--space-6); max-width: 360px; padding: var(--space-6);
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: var(--radius-md); box-shadow: var(--shadow-card);
    }
    input {
      font: inherit; width: 100%; margin-top: var(--space-3); padding: var(--space-2) var(--space-3);
      color: inherit; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">Primeira versao. Descreva a tela no briefing e peca a um agente para montar o blend.</p>
  <div class="row">
    <button class="btn">Principal</button>
    <button class="btn ghost">Secundario</button>
  </div>
  <div class="card">
    <strong>Card</strong>
    <input placeholder="Campo de texto">
  </div>
</body>
</html>
`
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
