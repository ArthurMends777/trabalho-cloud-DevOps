'use strict';
// Métricas Prometheus: métricas padrão do Node + histograma de latência HTTP (RED).
const client = require('prom-client');

function criarMetricas() {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const duracaoHttp = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP em segundos',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
  });

  // O label "route" usa o padrão da rota (ex.: /pedidos/:id), nunca a URL real,
  // para evitar explosão de cardinalidade.
  function middleware(req, res, next) {
    const fim = duracaoHttp.startTimer();
    res.on('finish', () => {
      const route = res.locals.route || req.route?.path || 'nao_mapeada';
      fim({ method: req.method, route, status: res.statusCode });
    });
    next();
  }

  return { register, middleware };
}

module.exports = { criarMetricas };
