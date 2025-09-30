# Makefile
# --------
# Helpful developer commands for Orbit.
# Usage:
#   make dev            # build + up (normal dev)
#   make dev-debug      # build + up with debug overrides
#   make down           # stop and remove containers
#   make logs           # tail both services
#   make backend-bash   # shell into backend container
#   make test           # run pytest inside backend container
#   make rebuild        # rebuild images without cache

COMPOSE := docker compose
BASE_FILES := -f compose.yml
DEBUG_FILES := -f compose.yml -f compose.dev.debug.yml

.PHONY: dev
dev:
	$(COMPOSE) $(BASE_FILES) up --build

.PHONY: dev-debug
dev-debug:
	$(COMPOSE) $(DEBUG_FILES) up --build

.PHONY: down
down:
	$(COMPOSE) $(DEBUG_FILES) down --remove-orphans || true
	$(COMPOSE) $(BASE_FILES) down --remove-orphans || true

.PHONY: logs
logs:
	$(COMPOSE) $(BASE_FILES) logs -f

.PHONY: backend-bash
backend-bash:
	$(COMPOSE) $(BASE_FILES) exec backend bash

.PHONY: test
test:
	# Runs pytest in the backend container with the dev compose stack.
	# If the stack isn't up yet, start it (detached) first.
	$(COMPOSE) $(BASE_FILES) up -d --build backend
	$(COMPOSE) $(BASE_FILES) exec -e APP_ENV=test backend bash -lc "pytest -q --disable-warnings --maxfail=1"

.PHONY: rebuild
rebuild:
	$(COMPOSE) $(BASE_FILES) build --no-cache

.PHONY: ps
ps:
	$(COMPOSE) $(BASE_FILES) ps

.PHONY: prune
prune:
	docker system prune -f