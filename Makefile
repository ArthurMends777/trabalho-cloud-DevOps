.PHONY: help up down logs test smoke kind-up kind-down

help:  ## Lista os comandos
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

up:  ## Sobe todo o ambiente local (Compose)
	@test -f .env || cp .env.example .env
	docker compose up -d --build

down:  ## Derruba o ambiente (mantém os volumes)
	docker compose down

logs:  ## Acompanha os logs dos serviços
	docker compose logs -f gateway pedidos pagamentos estoque

test:  ## Lint + testes de todos os serviços
	@for s in gateway pedidos pagamentos estoque; do \
	  echo "== $$s"; (cd services/$$s && npm ci --silent && npm run lint --silent && npm test --silent) || exit 1; \
	done

smoke:  ## Cria um pedido de exemplo via gateway
	curl -s -X POST localhost:8080/api/pedidos -H 'content-type: application/json' \
	  -d '{"cliente":"Ana","metodo":"pix","itens":[{"sku":"CAM-001","quantidade":2,"preco":49.9}]}'; echo

kind-up:  ## Cluster Kubernetes local (kind) com a aplicação
	kind create cluster --name loja-veloz
	for s in gateway pedidos pagamentos estoque; do \
	  docker build -t loja-veloz/$$s:dev services/$$s && kind load docker-image loja-veloz/$$s:dev --name loja-veloz; \
	done
	kubectl apply -f k8s/base/00-namespace.yaml
	kubectl -n loja-veloz create secret generic loja-veloz-secrets \
	  --from-literal=POSTGRES_PASSWORD=local-pg --from-literal=PEDIDOS_DB_PASSWORD=local-ped --from-literal=ESTOQUE_DB_PASSWORD=local-est
	kubectl apply -k k8s/overlays/local
	@echo "Aguarde os pods: kubectl -n loja-veloz get pods -w   |   Acesso: kubectl -n loja-veloz port-forward svc/gateway 8080:80"

kind-down:  ## Remove o cluster kind
	kind delete cluster --name loja-veloz
