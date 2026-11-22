'use strict';
const express = require('express');
const client = require('prom-client');
const { criarMetricas } = require('./metrics');
const log = require('./logger');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METODOS = ['cartao', 'pix', 'boleto', 'cartao_recusado'];

function validarPedido(body) {
  if (!body || typeof body !== 'object') return ['corpo da requisição inválido'];
  const erros = [];
  if (typeof body.cliente !== 'string' || !body.cliente.trim()) erros.push('cliente é obrigatório');
  if (body.metodo !== undefined && !METODOS.includes(body.metodo)) erros.push(`metodo deve ser um de: ${METODOS.join(', ')}`);
  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    erros.push('itens deve ser uma lista não vazia');
  } else {
    body.itens.forEach((it, i) => {
      if (typeof it?.sku !== 'string' || !it.sku) erros.push(`itens[${i}].sku inválido`);
      if (!Number.isInteger(it?.quantidade) || it.quantidade <= 0) erros.push(`itens[${i}].quantidade deve ser inteiro > 0`);
      if (typeof it?.preco !== 'number' || !(it.preco >= 0)) erros.push(`itens[${i}].preco inválido`);
    });
  }
  return erros;
}

const calcularTotal = (itens) => Math.round(itens.reduce((s, it) => s + it.quantidade * it.preco, 0) * 100) / 100;

function createApp({ repo, estoque, pagamentos }) {
  const app = express();
  const { register, middleware } = criarMetricas();
  const pedidosTotal = new client.Counter({
    name: 'pedidos_total',
    help: 'Pedidos processados, por status final',
    labelNames: ['status'],
    registers: [register],
  });

  app.disable('x-powered-by');
  app.use(middleware);
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (req, res) => {
    try {
      await repo.ping();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'indisponivel', motivo: 'banco' });
    }
  });
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  // Fluxo (saga orquestrada): cria pedido -> reserva estoque -> cobra -> confirma.
  // Se o pagamento falha, compensa liberando o estoque.
  app.post('/pedidos', async (req, res) => {
    const erros = validarPedido(req.body);
    if (erros.length) return res.status(400).json({ erro: 'requisicao_invalida', detalhes: erros });

    const { cliente, itens, metodo = 'cartao' } = req.body;
    const total = calcularTotal(itens);
    const pedido = await repo.criar({ cliente, itens, total });
    log.info('evento PedidoCriado', { evento: 'PedidoCriado', pedidoId: pedido.id, total });

    const finalizar = async (status, httpStatus, extra = {}) => {
      const atualizado = (await repo.atualizarStatus(pedido.id, status)) || { ...pedido, status };
      pedidosTotal.inc({ status });
      return res.status(httpStatus).json({ ...atualizado, ...extra });
    };

    try {
      const reserva = await estoque.reservar(pedido.id, itens);
      if (!reserva.ok) return await finalizar('SEM_ESTOQUE', 409, { detalhe: reserva.detalhe });

      const cobranca = await pagamentos.cobrar(pedido.id, total, metodo);
      if (!cobranca.ok) {
        await estoque.liberar(pedido.id); // compensação
        return await finalizar('FALHA_PAGAMENTO', 402, { detalhe: cobranca.detalhe });
      }
      log.info('evento PedidoConfirmado', { evento: 'PedidoConfirmado', pedidoId: pedido.id });
      return await finalizar('CONFIRMADO', 201, { transacaoId: cobranca.transacaoId });
    } catch (err) {
      log.error('falha ao processar pedido', { pedidoId: pedido.id, erro: err.message });
      await estoque.liberar(pedido.id).catch(() => {});
      return await finalizar('ERRO', 503, { erro: 'dependencia_indisponivel' }).catch(() => {});
    }
  });

  app.get('/pedidos', async (req, res) => res.json(await repo.listar()));

  app.get('/pedidos/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(400).json({ erro: 'id_invalido' });
    const pedido = await repo.buscar(req.params.id);
    if (!pedido) return res.status(404).json({ erro: 'pedido_nao_encontrado' });
    res.json(pedido);
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'json_invalido' });
    log.error('erro não tratado', { erro: err.message });
    res.status(500).json({ erro: 'erro_interno' });
  });

  return app;
}

module.exports = { createApp, validarPedido, calcularTotal };
