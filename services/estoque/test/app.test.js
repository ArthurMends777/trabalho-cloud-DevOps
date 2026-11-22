'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, chamar } = require('./helper');
const { createApp, consolidarItens } = require('../src/app');

// Repositório em memória (substitui o PostgreSQL nos testes unitários)
function repoFalso() {
  const itens = new Map([['CAM-001', 5], ['TEN-002', 1]]);
  const reservas = new Map();
  return {
    reservas,
    ping: async () => {},
    listar: async () => [...itens].map(([sku, quantidade]) => ({ sku, nome: sku, quantidade })),
    buscar: async (sku) => (itens.has(sku) ? { sku, nome: sku, quantidade: itens.get(sku) } : null),
    reservar: async (pedidoId, lista) => {
      for (const { sku, quantidade } of lista) if ((itens.get(sku) ?? 0) < quantidade) return { ok: false, sku };
      for (const { sku, quantidade } of lista) itens.set(sku, itens.get(sku) - quantidade);
      reservas.set(pedidoId, lista);
      return { ok: true };
    },
    liberar: async (pedidoId) => {
      for (const { sku, quantidade } of reservas.get(pedidoId) || []) itens.set(sku, itens.get(sku) + quantidade);
      reservas.delete(pedidoId);
      return { liberados: 1 };
    },
  };
}

test('consolidarItens soma SKUs repetidos', () => {
  assert.deepEqual(consolidarItens([{ sku: 'A', quantidade: 1 }, { sku: 'A', quantidade: 2 }]), [{ sku: 'A', quantidade: 3 }]);
});

test('estoque', async (t) => {
  const repo = repoFalso();
  const srv = await iniciar(createApp({ repo }));
  t.after(srv.fechar);

  await t.test('lista e busca itens', async () => {
    assert.equal((await chamar(srv.base, '/estoque')).json.length, 2);
    assert.equal((await chamar(srv.base, '/estoque/CAM-001')).json.quantidade, 5);
    assert.equal((await chamar(srv.base, '/estoque/NAO-EXISTE')).status, 404);
  });

  await t.test('reserva com sucesso', async () => {
    const r = await chamar(srv.base, '/reservas', { method: 'POST', body: { pedidoId: 'p1', itens: [{ sku: 'CAM-001', quantidade: 2 }] } });
    assert.equal(r.status, 201);
    assert.equal((await chamar(srv.base, '/estoque/CAM-001')).json.quantidade, 3);
  });

  await t.test('retorna 409 quando não há estoque', async () => {
    const r = await chamar(srv.base, '/reservas', { method: 'POST', body: { pedidoId: 'p2', itens: [{ sku: 'TEN-002', quantidade: 9 }] } });
    assert.equal(r.status, 409);
    assert.equal(r.json.sku, 'TEN-002');
  });

  await t.test('libera a reserva (compensação)', async () => {
    const r = await chamar(srv.base, '/reservas/p1', { method: 'DELETE' });
    assert.equal(r.status, 200);
    assert.equal((await chamar(srv.base, '/estoque/CAM-001')).json.quantidade, 5);
  });

  await t.test('valida entrada', async () => {
    const r = await chamar(srv.base, '/reservas', { method: 'POST', body: { pedidoId: 'p3', itens: [{ sku: 'X', quantidade: 0 }] } });
    assert.equal(r.status, 400);
  });

  await t.test('readyz devolve 503 se o banco cair', async () => {
    const ruim = await iniciar(createApp({ repo: { ...repo, ping: async () => { throw new Error('x'); } } }));
    const r = await chamar(ruim.base, '/readyz');
    await ruim.fechar();
    assert.equal(r.status, 503);
  });
});
