'use strict';
const log = require('./logger');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 3002);
const server = createApp().listen(PORT, () => log.info('serviço iniciado', { port: PORT }));

function encerrar(sinal) {
  log.info('encerrando (graceful shutdown)', { sinal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
