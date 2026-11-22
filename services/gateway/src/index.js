'use strict';
const log = require('./logger');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 8080);
const app = createApp({
  pedidosUrl: process.env.PEDIDOS_URL || 'http://pedidos:3001',
  estoqueUrl: process.env.ESTOQUE_URL || 'http://estoque:3003',
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 8000),
});
const server = app.listen(PORT, () => log.info('serviço iniciado', { port: PORT }));

function encerrar(sinal) {
  log.info('encerrando (graceful shutdown)', { sinal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
