'use strict';
// Logger JSON estruturado (12-Factor: logs como streams em stdout).
// Inclui trace_id/span_id quando há um span ativo -> correlação log <-> trace.
const { trace } = require('@opentelemetry/api');

const NIVEIS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const servico = process.env.SERVICE_NAME || 'app';

function contextoTrace() {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const { traceId, spanId } = span.spanContext();
  return { trace_id: traceId, span_id: spanId };
}

function escrever(nivel, msg, extra) {
  const minimo = NIVEIS[process.env.LOG_LEVEL || 'info'] ?? NIVEIS.info;
  if (NIVEIS[nivel] < minimo) return;
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level: nivel, service: servico, msg, ...contextoTrace(), ...extra }) + '\n'
  );
}

module.exports = {
  debug: (msg, extra = {}) => escrever('debug', msg, extra),
  info: (msg, extra = {}) => escrever('info', msg, extra),
  warn: (msg, extra = {}) => escrever('warn', msg, extra),
  error: (msg, extra = {}) => escrever('error', msg, extra),
};
