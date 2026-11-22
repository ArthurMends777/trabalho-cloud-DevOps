'use strict';
// Acesso ao PostgreSQL (schema "estoque"). Credenciais vêm de PGHOST/PGUSER/PGPASSWORD... (12-Factor).
const { Pool } = require('pg');

function criarRepo(pool = new Pool({ max: Number(process.env.PGPOOL_MAX || 10) })) {
  return {
    async ping() {
      await pool.query('SELECT 1');
    },

    async listar() {
      const { rows } = await pool.query('SELECT sku, nome, quantidade FROM estoque.itens ORDER BY sku');
      return rows;
    },

    async buscar(sku) {
      const { rows } = await pool.query('SELECT sku, nome, quantidade FROM estoque.itens WHERE sku = $1', [sku]);
      return rows[0] || null;
    },

    // Reserva atômica e idempotente por pedido. Retorna { ok:true } ou { ok:false, sku }.
    async reservar(pedidoId, itens) {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const ja = await conn.query('SELECT 1 FROM estoque.reservas WHERE pedido_id = $1 LIMIT 1', [pedidoId]);
        if (ja.rowCount > 0) {
          await conn.query('ROLLBACK');
          return { ok: true, idempotente: true };
        }
        for (const { sku, quantidade } of itens) {
          // UPDATE condicional evita estoque negativo mesmo com concorrência.
          const r = await conn.query(
            'UPDATE estoque.itens SET quantidade = quantidade - $2 WHERE sku = $1 AND quantidade >= $2 RETURNING sku',
            [sku, quantidade]
          );
          if (r.rowCount === 0) {
            await conn.query('ROLLBACK');
            return { ok: false, sku };
          }
          await conn.query('INSERT INTO estoque.reservas (pedido_id, sku, quantidade) VALUES ($1, $2, $3)', [pedidoId, sku, quantidade]);
        }
        await conn.query('COMMIT');
        return { ok: true };
      } catch (err) {
        await conn.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        conn.release();
      }
    },

    // Compensação (saga): devolve ao estoque o que foi reservado para o pedido.
    async liberar(pedidoId) {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const { rows } = await conn.query('DELETE FROM estoque.reservas WHERE pedido_id = $1 RETURNING sku, quantidade', [pedidoId]);
        for (const { sku, quantidade } of rows) {
          await conn.query('UPDATE estoque.itens SET quantidade = quantidade + $2 WHERE sku = $1', [sku, quantidade]);
        }
        await conn.query('COMMIT');
        return { liberados: rows.length };
      } catch (err) {
        await conn.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        conn.release();
      }
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = { criarRepo };
