.PHONY: up down seed test browser-test build cluster
up:
	docker compose up -d --build --wait
down:
	docker compose down
seed:
	python3 scripts/seed.py
test:
	./scripts/test.sh
browser-test:
	cd frontend && npm run test:e2e
build:
	cd frontend && npm ci && npm run build
cluster:
	./scripts/local-cluster.sh
