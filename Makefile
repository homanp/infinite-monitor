.PHONY: setup dev build clean test lint help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: ## Install deps (first-time setup)
	npm install

dev: ## Start the Next.js dev server
	npm run dev

build: ## Production build
	npm run build

start: ## Start production server
	npm run start

test: ## Run tests
	npm test

lint: ## Run linter
	npm run lint

clean: ## Remove build artifacts and widget dist
	rm -rf .next node_modules data/widgets.db data/widgets-dist

all: setup dev ## Full bootstrap: install, start dev server
