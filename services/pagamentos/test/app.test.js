'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, chamar } = require('./helper');
const { createApp } = require('../src/app');

test('pagamentos', async (t) => {
  const srv = await iniciar(createApp({ limite: 1000, latenciaMs: 0 }));
  t.after(srv.fechar);

  await t.test('aprova pagamento válido', async () => {
    const r = await chamar(srv.base, '/pagamentos', { method: 'POST', body: { pedidoId: 'p1', valor: 99.9, metodo: 'pix' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.status, 'APROVADO');
    assert.ok(r.json.transacaoId);
  });

  await t.test('recusa cartão_recusado', async () => {
    const r = await chamar(srv.base, '/pagamentos', { method: 'POST', body: { pedidoId: 'p2', valor: 10, metodo: 'cartao_recusado' } });
    assert.equal(r.status, 402);
    assert.equal(r.json.status, 'RECUSADO');
  });

  await t.test('recusa valor acima do limite', async () => {
    const r = await chamar(srv.base, '/pagamentos', { method: 'POST', body: { pedidoId: 'p3', valor: 5000 } });
    assert.equal(r.status, 402);
    assert.equal(r.json.motivo, 'limite_excedido');
  });

  await t.test('valida o corpo da requisição', async () => {
    const r = await chamar(srv.base, '/pagamentos', { method: 'POST', body: { valor: -1 } });
    assert.equal(r.status, 400);
    assert.equal(r.json.erro, 'requisicao_invalida');
  });

  await t.test('healthz, readyz e metrics', async () => {
    assert.equal((await chamar(srv.base, '/healthz')).status, 200);
    assert.equal((await chamar(srv.base, '/readyz')).status, 200);
    const m = await chamar(srv.base, '/metrics');
    assert.equal(m.status, 200);
    assert.match(m.texto, /pagamentos_total/);
    assert.match(m.texto, /http_request_duration_seconds/);
  });
});
