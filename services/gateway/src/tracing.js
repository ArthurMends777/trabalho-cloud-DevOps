'use strict';
// Tracing distribuído com OpenTelemetry.
// Só é ativado se OTEL_EXPORTER_OTLP_ENDPOINT estiver definido (ex.: http://jaeger:4318).
// Carregado ANTES da aplicação:  node --require ./src/tracing.js src/index.js
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
  const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici');
  const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');

  const ruido = new Set(['/healthz', '/readyz', '/metrics']);

  const sdk = new NodeSDK({
    serviceName: process.env.SERVICE_NAME || 'app',
    traceExporter: new OTLPTraceExporter(), // lê OTEL_EXPORTER_OTLP_ENDPOINT
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => ruido.has(req.url) }),
      new ExpressInstrumentation(),
      new UndiciInstrumentation(), // fetch() entre serviços -> propaga o header traceparent
      new PgInstrumentation(),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown().catch(() => {}));
}
