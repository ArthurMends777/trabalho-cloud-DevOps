'use strict';
const express = require('express');
const client = require('prom-client');
const { criarMetricas } = require('./metrics');
const log = require('./logger');

function consolidarItens(itens) {
  const mapa = new Map();
  for (const { sku, quantidade } of itens) mapa.set(sku, (mapa.get(sku) || 0) + quantidade);
  return [...mapa].map(([sku, quantidade]) => ({ sku, quantidade }));
}

function createApp({ repo }) {
  const app = express();
  const { register, middleware } = criarMetricas();
  const reservas = new client.Counter({
    name: 'estoque_reservas_total',
    help: 'Reservas de estoque, por resultado',
    labelNames: ['resultado'],
    registers: [register],
  });

  app.disable('x-powered-by');
  app.use(middleware);
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', (req, res) => res.json({ status: 'ok' })); // liveness: o processo responde
  app.get('/readyz', async (req, res) => {                        // readiness: dependências OK
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

  app.get('/estoque', async (req, res) => res.json(await repo.listar()));

  app.get('/estoque/:sku', async (req, res) => {
    const item = await repo.buscar(req.params.sku);
    if (!item) return res.status(404).json({ erro: 'sku_nao_encontrado' });
    res.json(item);
  });

  app.post('/reservas', async (req, res) => {
    const { pedidoId, itens } = req.body || {};
    const erros = [];
    if (typeof pedidoId !== 'string' || !pedidoId) erros.push('pedidoId é obrigatório');
    if (!Array.isArray(itens) || itens.length === 0) erros.push('itens deve ser uma lista não vazia');
    else {
      itens.forEach((it, i) => {
        if (typeof it?.sku !== 'string' || !it.sku) erros.push(`itens[${i}].sku inválido`);
        if (!Number.isInteger(it?.quantidade) || it.quantidade <= 0) erros.push(`itens[${i}].quantidade deve ser inteiro > 0`);
      });
    }
    if (erros.length) return res.status(400).json({ erro: 'requisicao_invalida', detalhes: erros });

    const r = await repo.reservar(pedidoId, consolidarItens(itens));
    if (!r.ok) {
      reservas.inc({ resultado: 'sem_estoque' });
      log.warn('estoque insuficiente', { pedidoId, sku: r.sku });
      return res.status(409).json({ erro: 'estoque_insuficiente', sku: r.sku });
    }
    reservas.inc({ resultado: 'reservado' });
    log.info('estoque reservado', { pedidoId });
    res.status(201).json({ pedidoId, status: 'RESERVADO' });
  });

  app.delete('/reservas/:pedidoId', async (req, res) => {
    const r = await repo.liberar(req.params.pedidoId);
    reservas.inc({ resultado: 'liberado' });
    log.info('reserva liberada', { pedidoId: req.params.pedidoId, ...r });
    res.json({ pedidoId: req.params.pedidoId, status: 'LIBERADO', ...r });
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'json_invalido' });
    log.error('erro não tratado', { erro: err.message });
    res.status(500).json({ erro: 'erro_interno' });
  });

  return app;
}

module.exports = { createApp, consolidarItens };
