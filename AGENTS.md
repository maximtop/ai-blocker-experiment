# AI Agent Rules

## Table of Contents

- [Project Overview](#project-overview)
- [Technical Context](#technical-context)
- [Project Structure](#project-structure)
- [Build And Test Commands](#build-and-test-commands)
- [Contribution Instructions](#contribution-instructions)
- [Code Guidelines](#code-guidelines)
    - [System Design](#system-design)
    - [Architecture](#architecture)
    - [Code Quality](#code-quality)
    - [Testing](#testing)
    - [Dependency Management](#dependency-management)
    - [Configuration & Documentation](#configuration--documentation)
    - [Markdown Formatting](#markdown-formatting)
    - [Other](#other)

## Project Overview

Experimental AI Ad Blocker is a Chrome Manifest V3 extension that blocks
unwanted page content with user-defined AI rules. It supports semantic
embedding rules, prompt-based text analysis, and vision rules that analyze
captured element screenshots.

The codebase is TypeScript-first and bundles separate extension contexts for
background service worker, content script, popup UI, options UI, and offscreen
image processing.

## Technical Context

- **Language/Version**: TypeScript targeting ES2022, strict mode enabled.
- **Primary Dependencies**: Chrome extension APIs, Rollup, SWC, Valibot,
  date-fns, nanoid, Vitest, ESLint with Airbnb rules.
- **Storage**: `chrome.storage.local`, wrapped by `src/shared/storage.ts` and
  typed through `src/shared/settings.ts` and `src/shared/settings-schema.ts`.
- **Testing**: Vitest in Node environment.
- **Target Platform**: Chrome extension, Manifest V3, minimum Chrome 149.
- **Project Type**: Browser extension.
- **Performance Goals**: Keep page impact low, avoid blocking page or browser
  UI threads, and queue expensive screenshot work.
- **Constraints**: Manifest V3 service worker lifecycle, isolated extension
  contexts, Chrome permission model, strict TypeScript, no import extensions.
- **Scale/Scope**: Experimental extension for developers and users testing
  AI-powered content blocking.

## Project Structure

```text
.
├── manifest.json              # Chrome extension manifest
├── package.json               # npm scripts and dependency manifest
├── Makefile                   # convenience wrappers for init/build/lint/test
├── rollup.config.js           # extension bundle configuration
├── src/
│   ├── background/            # service worker, rules, LLM, screenshots
│   ├── content/               # page scanning, DOM blur, screenshots
│   ├── shared/                # constants, storage, messaging, shared types
│   ├── options/               # settings page UI
│   ├── popup/                 # browser action popup UI
│   ├── offscreen/             # offscreen document image processing
│   ├── _locales/              # Chrome i18n message catalogs
│   └── icons/                 # extension icons
├── tests/
│   ├── background/            # service and message-handler tests
│   ├── content/               # content script and screenshot tests
│   ├── options/               # options settings tests
│   └── shared/                # shared schema/domain tests
├── test-page/                 # local manual-test pages and assets
├── dist/                      # generated build output, do not edit manually
└── CHANGELOG.md               # Keep a Changelog release notes
```

## Build And Test Commands

- `make init` or `pnpm install` installs dependencies.
- `make build` or `pnpm build` builds `dist/` and `dist/extension.zip`.
- `make lint` or `pnpm lint` runs ESLint and `tsc --noEmit`.
- `pnpm type-check` runs TypeScript only.
- `make test` or `pnpm test` runs the full Vitest suite.
- `pnpm dev` runs clean plus Rollup watch. It currently depends on
  `build:watch`; confirm that script exists before relying on it.

No standalone formatter command is configured.

## Contribution Instructions

- You MUST read this `AGENTS.md` before starting work and follow its rules.

- You MUST verify code changes with the configured lint and type checks.

  Use these commands:
    - `pnpm lint` to run ESLint and TypeScript checks.
    - `pnpm type-check` when only TypeScript validation is needed.
    - No formatter command is configured; keep formatting consistent manually.

- You MUST update or add unit tests for changed behavior.

- You MUST run `pnpm test` before completing behavior changes unless a narrower
  focused test is justified and documented.

- You MUST run `make build` when manifest, bundling, extension entry points, or
  generated assets can be affected.

- When changing the project structure, you MUST update the Project Structure
  section in `AGENTS.md`.

- If a prompt asks for refactoring or code-quality improvement, you MUST decide
  whether it should become a Code Guidelines rule and add it here when useful.

- After completing a task, you MUST verify that new code follows the Code
  Guidelines in this file.

- You MUST update `CHANGELOG.md` for user-facing behavior, compatibility, or
  feature changes.

- Do not revert unrelated worktree changes. This repository is often dirty with
  user or generated changes; work with relevant edits and leave unrelated files
  alone.

## Code Guidelines

### System Design

Design for a browser extension:

- Request only permissions that are needed. Broad host permissions must have a
  clear reason.
- Keep the extension lightweight. Added bundle size affects browser startup and
  page load.
- Separate concerns across extension contexts: background service worker for
  coordination and privileged APIs, content scripts for page interaction,
  popup/options for UI, and offscreen documents for DOM/canvas work that cannot
  happen in the service worker.
- Treat the background service worker as disposable. Persist critical state to
  `chrome.storage.local`; do not rely on long-lived in-memory state.
- Use message passing between contexts. Never share mutable state directly.
- React to browser events asynchronously. Do not block the page main thread or
  browser UI.
- Design for updates. Migrate or preserve stored data when changing settings
  shape, storage keys, rule formats, or defaults.

### Architecture

- **Separation of Concerns**: keep extension contexts and modules focused on one
  aspect of the system.
- **Single Responsibility Principle**: each class or file should have one main
  reason to change.
- **Dependency Direction**: context modules depend on `src/shared/`; shared code
  should not depend on UI or content details.
- **Explicit Boundaries**: communicate across contexts with typed messages and
  ports, not ad hoc globals.
- **Data Flow Clarity**: rules and settings load in background, content scripts
  receive filtered data, and analysis results flow back through messages.
- **Minimize Coupling, Maximize Cohesion**: keep LLM, rule parsing, screenshot,
  UI, and DOM mutation logic in their own modules.
- **Make Invalid States Impossible**: use TypeScript types, Valibot schemas, and
  named constants to constrain settings and messages.
- **Observability Built-in**: use `createLogger()` with module context for
  operational traces and failures.
- **Keep It Boring**: prefer existing project patterns and Chrome APIs over new
  abstractions or dependencies.

The project's layers, from top to bottom:

```text
Extension entry points
  background/entry.ts, content/entry.ts, popup/entry.ts, options/entry.ts
        ↓
Context managers and UI controllers
  BackgroundManager, ContentManager, Popup, Options
        ↓
Services and feature modules
  LLMService, RuleService, ScreenshotService, AutoScreenshotObserver
        ↓
Shared infrastructure
  constants, messaging, storage, settings schema, logger, rule types
        ↓
Chrome APIs and external providers
  chrome.storage, chrome.runtime, chrome.tabs, OpenAI, OpenRouter, LM Studio
```

Background code may call background services and shared modules. Content, popup,
options, and offscreen code may call shared modules and their local context
modules. Shared modules should stay context-neutral unless a type-only import is
needed for compile-time message typing.

**Known exclusions**:

- `src/shared/messaging.ts` imports `MessageMap` from
  `src/background/message-handler.ts` for type-safe responses. Keep this
  type-only import isolated; do not add runtime dependencies from shared code to
  background modules.

### Code Quality

- Never expose functions globally with `window.*`. Use ES module exports and
  imports instead.
- Never include `.js` or `.ts` file extensions in import statements.
- Use the project's `logger` utility instead of direct `console.*` calls.
- Prefer classes with static methods as namespaces for related utility
  operations.
- Do not add unused methods, future-proofing helpers, or speculative code.
- Use JSDoc block comments for functions and methods that need documentation.
  Include `@param`, `@returns`, and `@throws` when applicable.
- Do not rename imports or exports with `as` unless the user explicitly asks or
  there is a real naming conflict.
- Replace repeated magic strings and numbers with named constants.
- Put shared constants in `src/shared/constants.ts`; put context-local constants
  in context files such as `src/content/content-constants.ts`.
- Use UPPER_SNAKE_CASE for constant identifiers, camelCase for string values and
  variables/functions, PascalCase for classes/types, and kebab-case for file
  names.
- Sort named imports and exports alphabetically within braces.
- Avoid TypeScript type assertions. Prefer type guards, nullish coalescing, and
  runtime checks. Never use `as any`.
- Preserve backward compatibility for stored settings and rule formats unless a
  migration is part of the task.

### Testing

- Place tests under `tests/<area>/` and name them `*.test.ts`.
- Use Vitest assertions and mocks. Prefer focused unit tests for shared helpers,
  background services, content services, and options payload builders.
- Mock Chrome APIs at the boundary. Do not require a real browser for unit
  tests unless the task explicitly asks for browser automation.
- Add tests for new behavior before or alongside implementation.
- Keep tests deterministic: avoid real network calls, real downloads, or
  browser state.
- Run focused tests while iterating, then `pnpm test` before completion.

### Dependency Management

- Pin all dependency versions explicitly. Do not use ranges that allow automatic
  upgrades to untested versions.
- Prefer vanilla TypeScript, browser APIs, and existing project helpers when
  they adequately solve the problem.
- Add dependencies only from well-established, actively maintained projects.
- Avoid niche or obscure packages with limited adoption.
- Minimize dependency count because every dependency increases bundle size,
  attack surface, and maintenance burden.
- When adding a dependency, check the package registry for the latest stable
  version and use that exact version.

**Known exclusions**:

- `package.json` currently uses caret ranges (`^`) for dependencies and
  devDependencies. Do not introduce additional ranged dependencies; convert
  existing ranges only as a dedicated dependency-maintenance change.

### Configuration & Documentation

- Runtime settings live in `chrome.storage.local` and are validated through
  `settingsSchema`.
- Storage keys, message actions, ports, rule patterns, defaults, model IDs, and
  capture-path names belong in `src/shared/constants.ts` when shared across
  contexts.
- Manifest changes must be reflected in `manifest.json`; Rollup copies it into
  `dist/` and injects the version from `package.json`.
- Update `README.md` when user-facing setup, requirements, rules, or manual test
  flows change.
- Update `CHANGELOG.md` for user-facing changes under `## [Unreleased]`.
- Never commit secrets. API keys are user settings and must stay in extension
  storage only.
- Do not edit generated files in `dist/` directly; run `make build`.

### Markdown Formatting

All Markdown files MUST follow these formatting rules:

- **Line length**: Keep lines at most 80 characters. This is not a hard lint
  gate, but SHOULD be followed for readability. Lines inside fenced code blocks
  are exempt from this limit.
- **Unordered lists**: Use dashes (`-`) for bullet points. Indent nested list
  items by 4 spaces.
- **Emphasis**: Use asterisks (`*`) for emphasis (`*italic*`, `**bold**`). Do
  NOT use underscores.
- **Headings**: Duplicate heading names are allowed only among sibling headings
  with the same parent level. Avoid duplicates across different levels.
- **Inline HTML**: Avoid raw HTML in Markdown. The only allowed elements are
  `<a>`, `<p>`, `<details>`, `<summary>`, and `<img>`.
- **Trailing spaces**: Do NOT leave trailing whitespace on any line. Do NOT use
  two-space line breaks; use a blank line instead.
- **Bare URLs**: Bare URLs are permitted and do not need angle brackets.
- **Table formatting**: Align table columns with padding when the table fits
  within 80 characters. If the table exceeds 80 characters or triggers an MD060
  linter warning, switch to compact format using single spaces only. Separator
  rows should be written as `| --- |`, not `|--|`.

Example:

```markdown
| Col1 | Col2 |
| --- | --- |
| Value1 | Value2 |
```

### Other

- Keep `AGENTS.md` concise enough to be a working reference. Move onboarding
  details to `README.md` or a dedicated development document.
- For local HTML test pages, remember Chrome requires enabling "Allow access to
  file URLs" for the unpacked extension.
- HTML-in-Canvas screenshots require Chrome 149+ and
  `chrome://flags/#canvas-draw-element` for arbitrary extension testing.
