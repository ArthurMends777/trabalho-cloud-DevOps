'use strict';
// Clientes HTTP para os outros serviços. fetch() é instrumentado pelo OpenTelemetry (undici),
// então o header "traceparent" é propagado automaticamente entre os serviços.

async function chamar(base, caminho, { method = 'GET', body, timeoutMs }) {
  const res = await fetch(base + caminho, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* corpo vazio ou não-JSON */
  }
  return { status: res.status, data };
}

function criarClienteEstoque(base, timeoutMs = 3000) {
  return {
    async reservar(pedidoId, itens) {
      const r = await chamar(base, '/reservas', { method: 'POST', body: { pedidoId, itens }, timeoutMs });
      if (r.status === 201) return { ok: true };
      if (r.status === 409) return { ok: false, detalhe: r.data };
      throw new Error(`estoque respondeu HTTP ${r.status}`);
    },
    async liberar(pedidoId) {
      const r = await chamar(base, `/reservas/${encodeURIComponent(pedidoId)}`, { method: 'DELETE', timeoutMs });
      if (r.status >= 400) throw new Error(`estoque respondeu HTTP ${r.status} ao liberar`);
    },
  };
}

function criarClientePagamentos(base, timeoutMs = 5000) {
  return {
    async cobrar(pedidoId, valor, metodo) {
      const r = await chamar(base, '/pagamentos', { method: 'POST', body: { pedidoId, valor, metodo }, timeoutMs });
      if (r.status === 201) return { ok: true, transacaoId: r.data?.transacaoId };
      if (r.status === 402) return { ok: false, detalhe: r.data };
      throw new Error(`pagamentos respondeu HTTP ${r.status}`);
    },
  };
}

module.exports = { criarClienteEstoque, criarClientePagamentos };
