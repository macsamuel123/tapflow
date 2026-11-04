SHELL := /bin/bash
.DEFAULT_GOAL := help

SUPABASE := pnpm exec supabase

.PHONY: help install dev stop seed test test-api test-db lint lint-api lint-web types qr-urls

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies (root, web, api)
	pnpm install
	pnpm --dir web install
	cd api && uv sync

dev: ## Start local Supabase, then API (:8000) + web (:3000)
	$(SUPABASE) start
	pnpm exec concurrently -k -n api,web -c blue,green \
		"cd api && uv run uvicorn app.main:app --reload --port 8000" \
		"pnpm --dir web dev"

stop: ## Stop API + web dev servers, then local Supabase
	./scripts/stop-dev.sh
	$(SUPABASE) stop

seed: ## Reset local DB: re-apply migrations + seed.sql
	$(SUPABASE) db reset

test: test-api test-db ## Run all tests

test-api: ## pytest (integration tests skip if Supabase is not running)
	cd api && uv run pytest

test-db: ## pgTAP tests (RLS, grants, status guard) — needs `supabase start`
	$(SUPABASE) test db

lint: lint-api lint-web ## ruff + mypy + eslint + tsc

lint-api:
	cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy

lint-web:
	pnpm --dir web lint && pnpm --dir web exec tsc --noEmit

types: ## Regenerate web/src/lib/database.types.ts from the local DB
	$(SUPABASE) gen types typescript --local --schema public > web/src/lib/database.types.ts

qr-urls: ## Print signed touchpoint URLs for the seeded venue(s)
	cd api && uv run python -m app.scripts.qr_urls
