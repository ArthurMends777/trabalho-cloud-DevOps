'use strict';
// Acesso ao PostgreSQL (schema "pedidos").
const { Pool } = require('pg');

const COLUNAS = 'id, cliente, itens, total, status, criado_em';
const mapear = (r) => (r ? { ...r, total: Number(r.total) } : null);

function criarRepo(pool = new Pool({ max: Number(process.env.PGPOOL_MAX || 10) })) {
  return {
    async ping() {
      await pool.query('SELECT 1');
    },
    async criar({ cliente, itens, total }) {
      const { rows } = await pool.query(
        `INSERT INTO pedidos.pedidos (cliente, itens, total, status)
         VALUES ($1, $2::jsonb, $3, 'PENDENTE') RETURNING ${COLUNAS}`,
        [cliente, JSON.stringify(itens), total]
      );
      return mapear(rows[0]);
    },
    async atualizarStatus(id, status) {
      const { rows } = await pool.query(
        `UPDATE pedidos.pedidos SET status = $2 WHERE id = $1 RETURNING ${COLUNAS}`,
        [id, status]
      );
      return mapear(rows[0]);
    },
    async buscar(id) {
      const { rows } = await pool.query(`SELECT ${COLUNAS} FROM pedidos.pedidos WHERE id = $1`, [id]);
      return mapear(rows[0]);
    },
    async listar(limite = 50) {
      const { rows } = await pool.query(`SELECT ${COLUNAS} FROM pedidos.pedidos ORDER BY criado_em DESC LIMIT $1`, [limite]);
      return rows.map(mapear);
    },
    async close() {
      await pool.end();
    },
  };
}

module.exports = { criarRepo };
