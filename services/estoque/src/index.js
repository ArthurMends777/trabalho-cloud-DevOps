'use strict';
const log = require('./logger');
const { createApp } = require('./app');
const { criarRepo } = require('./repo');

const PORT = Number(process.env.PORT || 3003);
const repo = criarRepo();
const server = createApp({ repo }).listen(PORT, () => log.info('serviço iniciado', { port: PORT }));

function encerrar(sinal) {
  log.info('encerrando (graceful shutdown)', { sinal });
  server.close(async () => {
    await repo.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
