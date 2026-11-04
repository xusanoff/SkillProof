.PHONY: up down logs build test test-backend test-frontend lint lint-backend lint-frontend migrate seed ai-eval bench-search screenshots

UV ?= uv
COMPOSE ?= docker compose

up:            ## Build and start the full stack
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

test: test-backend test-frontend

test-backend:
	cd backend && $(UV) run pytest -q

test-frontend:
	cd frontend && pnpm test

lint: lint-backend lint-frontend

lint-backend:
	cd backend && $(UV) run ruff check . && $(UV) run ruff format --check . && $(UV) run mypy app

lint-frontend:
	cd frontend && pnpm lint && pnpm typecheck

migrate:
	$(COMPOSE) exec api alembic upgrade head

seed:          ## Demo companies, vacancies and accounts (local only, idempotent)
	$(COMPOSE) exec api python -m app.seed.demo

ai-eval:       ## Golden dataset for AI prompts (real provider if LLM_PROVIDER is set)
	cd backend && $(UV) run python -m tests.ai_eval.run

ai-eval-real:  ## Golden dataset on the real provider from the root .env (uses free API quota)
	set -a; . ./.env; set +a; cd backend && LLM_PROVIDER=openai_compatible $(UV) run python -m tests.ai_eval.run

bench-search:  ## Spec §9: search < 300 ms at 10k vacancies (uses a separate DB)
	$(COMPOSE) exec -T postgres psql -U skillproof -c "DROP DATABASE IF EXISTS skillproof_bench" -c "CREATE DATABASE skillproof_bench"
	cd backend && DATABASE_URL=postgresql+asyncpg://skillproof:skillproof@localhost:5432/skillproof_bench $(UV) run alembic upgrade head
	cd backend && DATABASE_URL=postgresql+asyncpg://skillproof:skillproof@localhost:5432/skillproof_bench $(UV) run python -m app.seed.demo --bulk 10000
	cd backend && DATABASE_URL=postgresql+asyncpg://skillproof:skillproof@localhost:5432/skillproof_bench LOG_LEVEL=WARNING PYTHONPATH=. $(UV) run python ../scripts/bench_search.py

screenshots:   ## Requires the stack running (make up)
	cd frontend && BASE_URL=http://localhost:$${WEB_PORT:-3000} pnpm screenshots
