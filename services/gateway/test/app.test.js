'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { iniciar, chamar } = require('./helper');
const { createApp } = require('../src/app');

// Serviço "upstream" falso que ecoa o que recebeu
function upstreamFalso() {
  const server = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.statusCode = req.url.includes('/falha') ? 418 : 200;
      res.end(JSON.stringify({ metodo: req.method, url: req.url, corpo: corpo ? JSON.parse(corpo) : null, requestId: req.headers['x-request-id'] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('gateway', async (t) => {
  const up = await upstreamFalso();
  const url = `http://127.0.0.1:${up.address().port}`;
  const srv = await iniciar(createApp({ pedidosUrl: url, estoqueUrl: url, timeoutMs: 1000 }));
  t.after(async () => { await srv.fechar(); up.close(); });

  await t.test('encaminha GET com query string', async () => {
    const r = await chamar(srv.base, '/api/pedidos/abc?x=1');
    assert.equal(r.status, 200);
    assert.equal(r.json.url, '/pedidos/abc?x=1');
    assert.ok(r.headers.get('x-request-id'));
  });

  await t.test('encaminha POST com corpo JSON', async () => {
    const r = await chamar(srv.base, '/api/pedidos', { method: 'POST', body: { cliente: 'Ana' } });
    assert.equal(r.json.metodo, 'POST');
    assert.deepEqual(r.json.corpo, { cliente: 'Ana' });
  });

  await t.test('repassa o status do serviço interno', async () => {
    assert.equal((await chamar(srv.base, '/api/pedidos/falha')).status, 418);
  });

  await t.test('estoque é somente leitura e pagamentos não é exposto', async () => {
    assert.equal((await chamar(srv.base, '/api/estoque', { method: 'POST', body: {} })).status, 405);
    assert.equal((await chamar(srv.base, '/api/pagamentos', { method: 'POST', body: {} })).status, 404);
  });

  await t.test('502 quando o serviço interno está fora do ar', async () => {
    const ruim = await iniciar(createApp({ pedidosUrl: 'http://127.0.0.1:1', estoqueUrl: url, timeoutMs: 500 }));
    const r = await chamar(ruim.base, '/api/pedidos');
    await ruim.fechar();
    assert.equal(r.status, 502);
  });
});
