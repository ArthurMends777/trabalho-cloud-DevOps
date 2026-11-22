#!/bin/sh
# Executado automaticamente pela imagem oficial do PostgreSQL na PRIMEIRA inicialização
# (/docker-entrypoint-initdb.d). Cria um schema e um usuário por serviço (menor privilégio):
# o serviço de pedidos não consegue ler/alterar tabelas do estoque, e vice-versa.
# As senhas vêm de variáveis de ambiente (12-Factor) - nunca ficam no código.
set -eu

: "${PEDIDOS_DB_PASSWORD:?defina PEDIDOS_DB_PASSWORD}"
: "${ESTOQUE_DB_PASSWORD:?defina ESTOQUE_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v pedidos_pw="$PEDIDOS_DB_PASSWORD" -v estoque_pw="$ESTOQUE_DB_PASSWORD" <<'EOSQL'
CREATE ROLE pedidos_svc LOGIN PASSWORD :'pedidos_pw';
CREATE ROLE estoque_svc LOGIN PASSWORD :'estoque_pw';

-- Ninguém além do dono usa o schema public
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- ===== Schema de PEDIDOS =====
CREATE SCHEMA pedidos AUTHORIZATION pedidos_svc;
CREATE TABLE pedidos.pedidos (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente   text           NOT NULL,
  itens     jsonb          NOT NULL,
  total     numeric(12,2)  NOT NULL CHECK (total >= 0),
  status    text           NOT NULL,
  criado_em timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX idx_pedidos_criado_em ON pedidos.pedidos (criado_em DESC);
ALTER TABLE pedidos.pedidos OWNER TO pedidos_svc;

-- ===== Schema de ESTOQUE =====
CREATE SCHEMA estoque AUTHORIZATION estoque_svc;
CREATE TABLE estoque.itens (
  sku        text PRIMARY KEY,
  nome       text    NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade >= 0)
);
CREATE TABLE estoque.reservas (
  id        bigserial PRIMARY KEY,
  pedido_id text    NOT NULL,
  sku       text    NOT NULL REFERENCES estoque.itens (sku),
  quantidade integer NOT NULL CHECK (quantidade > 0)
);
CREATE INDEX idx_reservas_pedido ON estoque.reservas (pedido_id);
ALTER TABLE estoque.itens    OWNER TO estoque_svc;
ALTER TABLE estoque.reservas OWNER TO estoque_svc;
ALTER SEQUENCE estoque.reservas_id_seq OWNER TO estoque_svc;

-- Dados de exemplo
INSERT INTO estoque.itens (sku, nome, quantidade) VALUES
  ('CAM-001', 'Camiseta básica',   100),
  ('TEN-002', 'Tênis esportivo',    50),
  ('MOC-003', 'Mochila urbana',     20),
  ('BON-004', 'Boné aba curva',    200);
EOSQL
