# Local builds never upload, submit, or publish. See DEVELOPMENT.md for outputs.
.DEFAULT_GOAL := build
override BROWSERS := chrome
override BROWSER_GOALS := $(filter $(BROWSERS),$(MAKECMDGOALS))
override BUILD_GOALS := $(filter build dev start release package,$(MAKECMDGOALS))
override COMMAND_GOALS := install setup init build dev start release package lint typecheck test check validate
override UNKNOWN_GOALS := $(filter-out $(COMMAND_GOALS) $(BROWSERS),$(MAKECMDGOALS))
ifneq ($(UNKNOWN_GOALS),)
  $(error Unknown command or unsupported browser: $(UNKNOWN_GOALS). Supported browsers: $(BROWSERS))
endif
ifneq ($(word 2,$(BROWSER_GOALS)),)
  $(error Choose at most one browser: $(BROWSERS))
endif
ifneq ($(BROWSER_GOALS),)
  ifneq ($(words $(BUILD_GOALS)),1)
    $(error A browser requires exactly one build command: build, dev, start, release or package)
  endif
endif
override BROWSER_TARGET := $(firstword $(BROWSER_GOALS))

.PHONY: $(COMMAND_GOALS) $(BROWSERS)

install setup init:
	pnpm install

build dev:
	pnpm build $(BROWSER_TARGET)

start:
	pnpm start $(BROWSER_TARGET)

release package:
	pnpm release $(BROWSER_TARGET)

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

check validate:
	pnpm check

$(BROWSERS):
	@:
