'use strict';
const log = require('./logger');
const { createApp } = require('./app');
const { criarRepo } = require('./repo');
const { criarClienteEstoque, criarClientePagamentos } = require('./clients');

const PORT = Number(process.env.PORT || 3001);
const repo = criarRepo();
const estoque = criarClienteEstoque(process.env.ESTOQUE_URL || 'http://estoque:3003');
const pagamentos = criarClientePagamentos(process.env.PAGAMENTOS_URL || 'http://pagamentos:3002');

const server = createApp({ repo, estoque, pagamentos }).listen(PORT, () => log.info('serviço iniciado', { port: PORT }));

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
