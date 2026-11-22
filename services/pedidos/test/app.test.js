'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, chamar } = require('./helper');
const { createApp, calcularTotal, validarPedido } = require('../src/app');

function montar({ reserva = { ok: true }, cobranca = { ok: true, transacaoId: 't-1' }, estoqueFalha = false } = {}) {
  const pedidos = new Map();
  const chamadas = { liberar: 0 };
  const repo = {
    ping: async () => {},
    criar: async ({ cliente, itens, total }) => {
      const p = { id: '11111111-1111-4111-8111-111111111111', cliente, itens, total, status: 'PENDENTE' };
      pedidos.set(p.id, p);
      return { ...p };
    },
    atualizarStatus: async (id, status) => {
      pedidos.get(id).status = status;
      return { ...pedidos.get(id) };
    },
    buscar: async (id) => pedidos.get(id) || null,
    listar: async () => [...pedidos.values()],
  };
  const estoque = {
    reservar: async () => { if (estoqueFalha) throw new Error('estoque fora'); return reserva; },
    liberar: async () => { chamadas.liberar += 1; },
  };
  const pagamentos = { cobrar: async () => cobranca };
  return { app: createApp({ repo, estoque, pagamentos }), pedidos, chamadas };
}

const corpo = { cliente: 'Ana', metodo: 'pix', itens: [{ sku: 'CAM-001', quantidade: 2, preco: 49.9 }] };

test('calcularTotal e validarPedido', () => {
  assert.equal(calcularTotal([{ quantidade: 3, preco: 0.1 }]), 0.3);
  assert.ok(validarPedido({}).length > 0);
  assert.deepEqual(validarPedido(corpo), []);
});

test('POST /pedidos confirma quando estoque e pagamento aprovam', async (t) => {
  const { app } = montar();
  const srv = await iniciar(app);
  t.after(srv.fechar);
  const r = await chamar(srv.base, '/pedidos', { method: 'POST', body: corpo });
  assert.equal(r.status, 201);
  assert.equal(r.json.status, 'CONFIRMADO');
  assert.equal(r.json.total, 99.8);
});

test('POST /pedidos retorna 409 sem estoque', async (t) => {
  const { app, chamadas } = montar({ reserva: { ok: false, detalhe: { sku: 'CAM-001' } } });
  const srv = await iniciar(app);
  t.after(srv.fechar);
  const r = await chamar(srv.base, '/pedidos', { method: 'POST', body: corpo });
  assert.equal(r.status, 409);
  assert.equal(r.json.status, 'SEM_ESTOQUE');
  assert.equal(chamadas.liberar, 0);
});

test('pagamento recusado libera o estoque (compensação)', async (t) => {
  const { app, chamadas } = montar({ cobranca: { ok: false, detalhe: { motivo: 'cartao_recusado' } } });
  const srv = await iniciar(app);
  t.after(srv.fechar);
  const r = await chamar(srv.base, '/pedidos', { method: 'POST', body: corpo });
  assert.equal(r.status, 402);
  assert.equal(r.json.status, 'FALHA_PAGAMENTO');
  assert.equal(chamadas.liberar, 1);
});

test('dependência fora do ar -> 503 e status ERRO', async (t) => {
  const { app, pedidos } = montar({ estoqueFalha: true });
  const srv = await iniciar(app);
  t.after(srv.fechar);
  const r = await chamar(srv.base, '/pedidos', { method: 'POST', body: corpo });
  assert.equal(r.status, 503);
  assert.equal([...pedidos.values()][0].status, 'ERRO');
});

test('valida entrada e consulta por id', async (t) => {
  const { app } = montar();
  const srv = await iniciar(app);
  t.after(srv.fechar);
  assert.equal((await chamar(srv.base, '/pedidos', { method: 'POST', body: { cliente: '' } })).status, 400);
  assert.equal((await chamar(srv.base, '/pedidos/abc')).status, 400);
  assert.equal((await chamar(srv.base, '/pedidos/22222222-2222-4222-8222-222222222222')).status, 404);
  await chamar(srv.base, '/pedidos', { method: 'POST', body: corpo });
  const ok = await chamar(srv.base, '/pedidos/11111111-1111-4111-8111-111111111111');
  assert.equal(ok.status, 200);
  assert.equal(ok.json.cliente, 'Ana');
});
