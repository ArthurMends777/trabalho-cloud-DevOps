'use strict';
const express = require('express');
const client = require('prom-client');
const { randomUUID } = require('node:crypto');
const { criarMetricas } = require('./metrics');
const log = require('./logger');

const METODOS = ['cartao', 'pix', 'boleto', 'cartao_recusado'];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Simula a integração com um gateway de pagamento EXTERNO (latência + recusa).
function createApp({
  limite = Number(process.env.PAGAMENTO_LIMITE || 10000),
  latenciaMs = Number(process.env.PAGAMENTO_LATENCIA_MS || 150),
} = {}) {
  const app = express();
  const { register, middleware } = criarMetricas();
  const cobrancas = new client.Counter({
    name: 'pagamentos_total',
    help: 'Cobranças processadas, por resultado',
    labelNames: ['resultado'],
    registers: [register],
  });

  app.disable('x-powered-by');
  app.use(middleware);
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', (req, res) => res.json({ status: 'ready' }));
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  app.post('/pagamentos', async (req, res) => {
    const { pedidoId, valor, metodo = 'cartao' } = req.body || {};
    const erros = [];
    if (typeof pedidoId !== 'string' || !pedidoId) erros.push('pedidoId é obrigatório');
    if (typeof valor !== 'number' || !(valor > 0)) erros.push('valor deve ser um número maior que zero');
    if (!METODOS.includes(metodo)) erros.push(`metodo deve ser um de: ${METODOS.join(', ')}`);
    if (erros.length) return res.status(400).json({ erro: 'requisicao_invalida', detalhes: erros });

    await dormir(latenciaMs);

    if (metodo === 'cartao_recusado' || valor > limite) {
      cobrancas.inc({ resultado: 'recusado' });
      log.warn('pagamento recusado', { pedidoId, valor, metodo });
      return res.status(402).json({ status: 'RECUSADO', motivo: valor > limite ? 'limite_excedido' : 'cartao_recusado' });
    }
    cobrancas.inc({ resultado: 'aprovado' });
    log.info('pagamento aprovado', { pedidoId, valor, metodo });
    return res.status(201).json({ status: 'APROVADO', transacaoId: randomUUID() });
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'json_invalido' });
    log.error('erro não tratado', { erro: err.message });
    res.status(500).json({ erro: 'erro_interno' });
  });

  return app;
}

module.exports = { createApp };
