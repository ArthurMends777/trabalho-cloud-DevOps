'use strict';
const express = require('express');
const { randomUUID } = require('node:crypto');
const { criarMetricas } = require('./metrics');
const log = require('./logger');

// Encaminha a requisição para um serviço interno e devolve a resposta.
function proxyPara(base, prefixoDestino, { metodos, timeoutMs, rotulo }) {
  return async (req, res) => {
    res.locals.route = rotulo;
    if (!metodos.includes(req.method)) return res.status(405).json({ erro: 'metodo_nao_permitido' });

    const destino = base + prefixoDestino + (req.url === '/' ? '' : req.url);
    const requestId = req.get('x-request-id') || randomUUID();
    res.set('x-request-id', requestId);
    const temCorpo = !['GET', 'HEAD', 'DELETE'].includes(req.method);

    try {
      const resp = await fetch(destino, {
        method: req.method,
        headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: temCorpo ? JSON.stringify(req.body ?? {}) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const texto = await resp.text();
      res.status(resp.status).type(resp.headers.get('content-type') || 'application/json').send(texto);
    } catch (err) {
      const timeout = err.name === 'TimeoutError';
      log.error('falha ao chamar serviço interno', { destino, erro: err.message, requestId });
      res.status(timeout ? 504 : 502).json({ erro: timeout ? 'timeout_servico' : 'servico_indisponivel' });
    }
  };
}

function createApp({ pedidosUrl, estoqueUrl, timeoutMs = 8000 }) {
  const app = express();
  const { register, middleware } = criarMetricas();

  app.disable('x-powered-by');
  app.use(middleware);
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', (req, res) => res.json({ status: 'ready' }));
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  // Único ponto de entrada público. O serviço de Pagamentos NÃO é exposto.
  app.use('/api/pedidos', proxyPara(pedidosUrl, '/pedidos', { metodos: ['GET', 'POST'], timeoutMs, rotulo: '/api/pedidos' }));
  app.use('/api/estoque', proxyPara(estoqueUrl, '/estoque', { metodos: ['GET'], timeoutMs, rotulo: '/api/estoque' }));

  app.use((req, res) => res.status(404).json({ erro: 'rota_nao_encontrada' }));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'json_invalido' });
    log.error('erro não tratado', { erro: err.message });
    res.status(500).json({ erro: 'erro_interno' });
  });

  return app;
}

module.exports = { createApp };
