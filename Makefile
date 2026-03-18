.PHONY: setup dev build clean test lint help setup-widgets

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: setup-widgets ## Install deps + set up widget workspace (first-time setup)
	npm install

setup-widgets: ## Initialize the widget build workspace (node_modules + shadcn)
	@echo "Setting up widget workspace..."
	@mkdir -p data/widget-workspace
	@cp -r widget-template/* data/widget-workspace/
	cd data/widget-workspace && npm install
	cd data/widget-workspace && npx shadcn@latest add --yes \
		button card badge input table tabs scroll-area skeleton separator \
		progress alert avatar checkbox dialog dropdown-menu label popover \
		radio-group select sheet slider switch textarea toggle tooltip \
		accordion collapsible command context-menu hover-card menubar \
		navigation-menu pagination resizable sonner
	@echo "Widget workspace ready."

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

clean: ## Remove build artifacts and data
	rm -rf .next node_modules data/widgets.db data/widgets-dist data/widget-builds data/widget-workspace

all: setup dev ## Full bootstrap: install, set up widgets, start dev server
