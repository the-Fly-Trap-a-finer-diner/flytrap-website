// HTML for the staff link. The key is checked before this renders and is put
// in a data attribute, escaped, so the button can send it back.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STYLE = `body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:24px;max-width:28rem}
h1{font-size:1.4rem}button{font-size:1.1rem;padding:14px 20px;border-radius:10px;border:0;background:#1f4d2b;color:#fff;width:100%}
button:disabled{opacity:.6}#status{margin-top:16px;font-size:1rem;line-height:1.4}`;

export function staffPage(key) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Refresh the Fly Trap website</title><style>${STYLE}</style></head>
<body><main id="app" data-key="${esc(key)}">
<h1>Refresh the website</h1>
<p>Publishing in Toast updates the website by itself within a couple of minutes. Press this only if a change still is not showing.</p>
<button id="go">Refresh specials now</button><p id="status" role="status"></p>
</main><script>
const KEY = document.getElementById('app').dataset.key;
const btn = document.getElementById('go'), out = document.getElementById('status');
btn.addEventListener('click', async () => {
  btn.disabled = true; out.textContent = 'Starting...';
  try {
    const res = await fetch('/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: KEY }) });
    out.textContent = (await res.json()).message;
  } catch (e) { out.textContent = 'Could not reach the refresh service. Try again in a minute.'; }
  btn.disabled = false;
});
</script></body></html>`;
}

export function invalidLinkPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Fly Trap refresh</title><style>${STYLE}</style></head>
<body><p>This link is not valid. Ask Ryan for the current one.</p></body></html>`;
}
