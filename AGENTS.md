# AI Agent Rules

This document contains rules and guidelines for AI assistants working on this project.

## Essential Workflow Rules

### Always Check AGENTS.md First

**Rule**: Before starting any work on this project, AI assistants must always read and review the contents of this AGENTS.md file to understand the current project rules and conventions.

**Requirements**:
- Read AGENTS.md at the beginning of any coding session
- Follow all rules specified in this document
- If rules conflict with other instructions, AGENTS.md takes precedence
- Update this file when new patterns or rules are established

**Rationale**:
- Ensures consistent behavior across all AI assistant interactions
- Prevents regression of established patterns and conventions
- Maintains code quality and project standards
- Provides a single source of truth for project guidelines

## Code Organization Rules

### Use Modules Instead of Global Exposure

**Rule**: AI assistants must never expose functions globally via `window.*` assignments. Always use ES6 module exports and imports instead.

**Bad**:
```javascript
function myFunction() { /* ... */ }
window.myFunction = myFunction;  // ❌ Don't do this
```

**Good**:
```javascript
export function myFunction() { /* ... */ }  // ✅ Use module exports

// In consuming files:
import { myFunction } from './my-module.js';  // ✅ Use imports
```

**Rationale**:
- Module system provides better encapsulation and dependency management
- Avoids global namespace pollution
- Enables tree-shaking and better bundling
- Makes dependencies explicit and trackable
- Follows modern JavaScript best practices

**Exceptions**:
- Debug/development utilities may temporarily use globals for console access, but should be migrated to modules when possible
- Browser extension APIs that require global access (rare cases)

### No File Extensions in Imports

**Rule**: AI assistants must NEVER use file extensions (`.js`, `.ts`) in import statements. Always import modules without extensions.

**Bad**:
```typescript
import { myFunction } from './my-module.js';  // ❌ Don't use extensions
import { MyClass } from '../shared/utils.ts';  // ❌ Don't use extensions
```

**Good**:
```typescript
import { myFunction } from './my-module';  // ✅ No extension
import { MyClass } from '../shared/utils';  // ✅ No extension
```

**Rationale**:
- Maintains consistency across the codebase
- Makes refactoring easier (changing file extensions doesn't break imports)
- Follows TypeScript best practices for module resolution
- Avoids confusion about whether to use `.js` or `.ts` extensions
- ESLint will enforce this rule and fail builds if extensions are used

**Enforcement**:
- ESLint rule `no-restricted-imports` with patterns is configured to catch this
- Running `pnpm lint` will report errors for any imports with extensions
- All existing code must follow this pattern

### Console Usage

**Rule**: Use the project's `logger` utility instead of direct `console.*` calls to maintain consistent logging and satisfy linting rules.

**Bad**:
```javascript
console.log('Debug message');  // ❌ Don't use console directly
```

**Good**:
```javascript
import { createLogger } from '../shared/logger.ts';

const logger = createLogger('ComponentName');
logger.info('Debug message');  // ✅ Use createLogger with context
```

**Rationale**:
- Presets the context, making log calls cleaner
- Centralizes all logging through a consistent interface
- Avoids ESLint errors from direct console usage
- Provides structured logging with context prefixes

### Use Classes as Namespaces

**Rule**: When creating utility modules or collections of related functionality, prefer using classes with static methods as namespaces instead of standalone functions.

**Bad**:
```javascript
// Multiple standalone functions
export function parseRule(ruleString) { /* ... */ }
export function applyRules(checker, threshold) { /* ... */ }
export function validateRule(rule) { /* ... */ }
```

**Good**:
```javascript
// Class as namespace with static methods
export class RuleEngine {
  static parseRule(ruleString) { /* ... */ }
  static applyRules(checker, threshold) { /* ... */ }
  static validateRule(rule) { /* ... */ }
}
```

**Rationale**:
- Provides better organization and grouping of related functionality
- Creates clear namespaces that prevent naming conflicts
- Enables better IDE support and autocomplete
- Allows for easier extension with inheritance if needed
- Follows modern JavaScript patterns for organizing code

### No Unused Code

**Rule**: AI assistants must not add methods, functions, or any code that is not immediately used unless explicitly requested by the user.

**Requirements**:
- Only implement functionality that is actively called or exported for use
- Do not add "convenience" methods, "future-proofing" code, or "just in case" functionality
- If adding debug/utility methods, ensure they are actually used or explicitly requested
- Remove any unused code during refactoring

**Bad**:
```javascript
export class MyService {
  static doSomething() { /* used */ }
  static reset() { /* unused - don't add this */ }
  static helpers() { /* unused - don't add this */ }
}
```

**Good**:
```javascript
export class MyService {
  static doSomething() { /* used - keep this */ }
  // Only add methods that are actually needed
}
```

**Rationale**:
- Keeps codebase lean and focused
- Reduces maintenance burden
- Avoids confusion about what code is actually used
- Follows YAGNI (You Aren't Gonna Need It) principle

### Use JSDoc for Function Documentation

**Rule**: AI assistants must use JSDoc style documentation for functions and methods, not simple comments.

**Bad**:
```javascript
// Handle extension context invalidation
static handleInvalidated(cleanupCallback) {
  // implementation
}
```

**Good**:
```javascript
/**
 * Handle extension context invalidation
 * @param {function} cleanupCallback Callback to perform cleanup operations
 */
static handleInvalidated(cleanupCallback) {
  // implementation
}
```

**Requirements**:
- Use `/** */` block comments for function/method documentation
- Include `@param` annotations for all parameters with types and descriptions
- Include `@returns` annotation when function returns a value
- Include `@throws` annotation when function can throw errors
- Use proper JSDoc syntax for better IDE support and documentation generation

**Rationale**:
- Provides better IDE intellisense and autocompletion
- Enables automatic documentation generation
- Standardized format that developers expect
- Better type checking and tooling support
- More descriptive than simple comments

### No Import/Export Renaming Without Explicit Request

**Rule**: AI assistants must not use `as` to rename imports or exports unless explicitly requested by the user.

**Bad**:
```javascript
import { MyClass as ShorterName } from './my-module.js';
export { DebugUtils as debug } from './debug-utils.js';
```

**Good**:
```javascript
import { MyClass } from './my-module.js';
export { DebugUtils } from './debug-utils.js';
```

**Requirements**:
- Use original names from imports and exports
- Only use `as` for renaming when explicitly requested by the user
- Avoid arbitrary name changes that can confuse other developers
- Maintain consistency with the original module's naming

**Exceptions**:
- When there are genuine naming conflicts that need resolution
- When explicitly requested by the user for specific reasons
- When working with default exports that need descriptive names

**Rationale**:
- Maintains clarity about what is being imported/exported
- Preserves the original author's naming intentions
- Reduces confusion for other developers reading the code
- Makes code more predictable and searchable

### Eliminate Magic Strings and Numbers

**Rule**: AI assistants must identify and replace magic strings and numbers with properly named constants.

**Bad**:
```javascript
if (user.role === 'admin') {  // ❌ Magic string
  threshold = 0.32;           // ❌ Magic number
  mode = 'analyzing';         // ❌ Magic string
}
```

**Good**:
```javascript
const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user'
};

const DEFAULT_THRESHOLD = 0.32;

const PROCESSING_MODE = {
  ANALYZING: 'analyzing',
  COMPLETED: 'completed'
};

if (user.role === USER_ROLES.ADMIN) {  // ✅ Named constant
  threshold = DEFAULT_THRESHOLD;       // ✅ Named constant
  mode = PROCESSING_MODE.ANALYZING;    // ✅ Named constant
}
```

**Requirements**:
- Always scan code for hardcoded strings and numbers
- Create appropriately named constants in relevant constants files
- Import and use constants instead of literal values
- Group related constants into objects when appropriate
- Document the purpose of constants with comments
- **For shared values**: Place constants in `src/shared/constants.js` when used across multiple script contexts (background, content, popup, options)
- **For local values**: Place constants in module-specific files (e.g., `content-constants.js`) when only used within one context

**Constant Placement Guidelines**:

Shared constants file (`src/shared/constants.js`) should contain:
- Message action names (ACTIONS)
- Storage keys (STORAGE_KEYS)
- Port names for chrome.runtime connections (PORT_NAMES)
- Rule patterns and types (RULE_PATTERNS, RULE_TYPE)
- DOM element IDs used across pages (DOM_ELEMENT_IDS)
- Default configuration values used globally
- API-related constants

Local constants files (e.g., `src/content/content-constants.js`) should contain:
- Module-specific timeouts and delays
- Local configuration values
- Component-specific enumerations

**Exception**:
- Single-use values that are self-explanatory (like array indices, basic math operations)
- Values that are inherently domain-specific and obvious from context

**Rationale**:
- Prevents typos and runtime errors
- Makes code more maintainable and refactorable
- Provides single source of truth for configuration values
- Improves code readability and self-documentation
- Enables IDE autocomplete and type checking
- Reduces duplication when the same value is needed in multiple places

### Sort Imports and Exports Alphabetically

**Rule**: AI assistants must always sort imported and exported items alphabetically within their import/export statements to maintain consistency and avoid linting errors.

**Bad**:
```javascript
import { ACTIONS, DEFAULT_SIMILARITY_THRESHOLD, STORAGE_KEYS, RULE_PATTERNS } from '../shared/constants.js';
export { UserService, AuthService, ConfigService, DataService } from './services.js';
```

**Good**:
```javascript
import { ACTIONS, DEFAULT_SIMILARITY_THRESHOLD, RULE_PATTERNS, STORAGE_KEYS } from '../shared/constants.js';
export { AuthService, ConfigService, DataService, UserService } from './services.js';
```

**Requirements**:
- Always arrange imported items in alphabetical order within destructuring braces
- Always arrange exported items in alphabetical order within destructuring braces
- Apply alphabetical sorting to both named imports/exports and re-exports
- Maintain consistent sorting across all files in the project

**Rationale**:
- Satisfies linting rules that enforce import/export sorting
- Makes imports and exports more readable and predictable
- Reduces merge conflicts when multiple developers modify imports
- Follows established JavaScript community conventions
- Enables better code organization and maintenance

### Consistent Naming Conventions

**Rule**: AI assistants must use consistent naming conventions throughout the codebase. All string values must use **camelCase**, never snake_case or other formats.

**Bad**:
```javascript
export const STORAGE_KEYS = {
  API_KEY: 'api_key',              // ❌ snake_case
  USER_SETTINGS: 'user-settings',  // ❌ kebab-case
  CACHE_DATA: 'CacheData',         // ❌ PascalCase
};
```

**Good**:
```javascript
export const STORAGE_KEYS = {
  API_KEY: 'apiKey',              // ✅ camelCase
  USER_SETTINGS: 'userSettings',  // ✅ camelCase
  CACHE_DATA: 'cacheData',        // ✅ camelCase
};
```

**Requirements**:
- **Constant names** (keys): Use UPPER_SNAKE_CASE for constant identifiers
- **String values**: Always use camelCase for all string values
- **Variable names**: Use camelCase for variables, functions, and methods
- **Class names**: Use PascalCase for class names
- **File names**: Use kebab-case for file names (e.g., `my-component.js`)
- Never mix naming conventions within the same context

**Specific Rules for Storage Keys**:
```javascript
// Constant identifier: UPPER_SNAKE_CASE
// String value: camelCase
export const STORAGE_KEYS = {
  LLM_ANALYSIS_CACHE: 'llmAnalysisCache',    // ✅
  LLM_CACHE_META: 'llmCacheMeta',            // ✅
  OPENAI_API_KEY: 'openaiApiKey',            // ✅
};
```

**Rationale**:
- Prevents confusion and inconsistencies across the codebase
- Makes code more readable and predictable
- Follows JavaScript community standards and conventions
- Ensures compatibility with JSON serialization and storage APIs
- Makes refactoring and searching easier

### Minimize TypeScript Type Assertions

**Rule**: Avoid using type assertions (`as Type`) whenever possible. Prefer type guards, proper type narrowing, and nullish coalescing for safer type handling.

**Bad**:
```typescript
// Unnecessary assertion - could fail at runtime
const value = result[key] as string;
element.value = value;

// Using 'as any' - bypasses all type checking
const data = response as any;
data.someProp.doSomething();
```

**Good**:
```typescript
// Use nullish coalescing with defaults
const value = result[key] as string | undefined;
element.value = value ?? '';

// Or use optional chaining with fallback
if (result[key]) {
    element.value = String(result[key]);
}

// Best: Use proper type guards
function isString(value: unknown): value is string {
    return typeof value === 'string';
}

const value = result[key];
if (isString(value)) {
    element.value = value;  // Type is narrowed to string
}
```

**When assertions are acceptable**:
```typescript
// When working with untyped external APIs (Storage, DOM, etc.)
// where you KNOW the runtime type from documentation
const apiKey = result[STORAGE_KEYS.OPENAI_API_KEY] as string | undefined;
if (apiKey) {
    this.openaiKeyInput.value = apiKey;
}

// When downcasting in controlled scenarios
const element = document.getElementById('myInput') as HTMLInputElement;
```

**Requirements**:
- Never use `as any` - it completely bypasses type checking
- When an assertion is unavoidable, include `| undefined` in the assertion to make null/undefined handling explicit
- Add runtime checks when asserting types from external sources
- Document WHY the assertion is needed with a comment
- Consider refactoring the source to provide better types instead

**Rationale**:
- Type assertions can hide runtime type errors
- TypeScript cannot verify assertions at runtime
- Proper type narrowing provides compile-time and runtime safety
- Makes code more robust and self-documenting
- Reduces debugging time when types don't match expectations

## General Guidelines

- Always check existing project conventions before making changes
- Follow the established code style and linting rules
- Prefer explicit imports over implicit global dependencies
- Maintain backwards compatibility when refactoring existing APIs
