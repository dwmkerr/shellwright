default: help

.PHONY: help
help: # Show help for each of the Makefile recipes.
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

.PHONY: dev
dev: # Run development server with hot-reload.
	npm run dev

.PHONY: build
build: # Build the project.
	npm install
	npm run build

.PHONY: test
test: # Run tests.
	npm test

.PHONY: lint
lint: # Run linter.
	npm run lint

.PHONY: clean
clean: # Remove build artifacts.
	rm -rf dist node_modules

.PHONY: docker-build
docker-build: # Build the Docker image.
	docker build -t shellwright .

.PHONY: docker-run
docker-run: docker-build # Build and run the Docker container.
	docker run --rm -it -p 7498:7498 shellwright

.PHONY: helm-lint
helm-lint: # Lint the Helm chart.
	helm lint chart

.PHONY: helm-template
helm-template: # Render the Helm chart templates.
	helm template shellwright chart
