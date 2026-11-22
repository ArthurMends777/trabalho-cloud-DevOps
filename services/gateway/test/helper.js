'use strict';
process.env.LOG_LEVEL = 'silent';

async function iniciar(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, fechar: () => new Promise((r) => server.close(r)) };
}

async function chamar(base, caminho, { method = 'GET', body } = {}) {
  const res = await fetch(base + caminho, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* não-JSON */ }
  return { status: res.status, json, texto, headers: res.headers };
}

module.exports = { iniciar, chamar };
