# Install dependencies
.PHONY: init
init:
	pnpm install

# Build the extension
.PHONY: build
build:
	pnpm build

# Lint the code
.PHONY: lint
lint:
	pnpm lint
