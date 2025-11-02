module.exports = {
    root: true,
    env: {
        browser: true,
    },
    extends: [
        'airbnb-base',
        'plugin:jsdoc/recommended',
    ],
    plugins: ['import', 'jsdoc'],
    parserOptions: {
        ecmaVersion: 'latest',
    },
    ignorePatterns: [
        'dist/',
        'node_modules/',
    ],
    rules: {
        indent: ['error', 4, { SwitchCase: 1 }],
        'max-len': ['error', {
            code: 80,
            ignorePattern: '^\\s*(logger\\.|console\\.)',
            ignoreStrings: true,
            ignoreComments: true,
        }],
        'import/extensions': ['error', 'never', {
            js: 'never',
            ts: 'never',
        }],
        'import/prefer-default-export': 'off',
        'import/no-extraneous-dependencies': ['error', {
            devDependencies: [
                '**/*.config.js',
                '**/*.config.cjs',
                '**/*.config.ts',
                'rollup.config.js',
                'tests/**/*',
            ],
        }],
        'no-restricted-globals': 'off',
        'no-restricted-syntax': 'off',
        'no-alert': 'off',
        'no-continue': 'off',
        'no-await-in-loop': 'off',
        'jsdoc/check-indentation': 'error',
        'jsdoc/require-jsdoc': 'off',
    },
    globals: {
        chrome: 'readonly',
    },
    settings: {
        'import/resolver': {
            typescript: {
                alwaysTryTypes: true,
                project: './tsconfig.json',
            },
        },
    },
    overrides: [
        {
            files: ['**/*.ts', '**/*.tsx'],
            parser: '@typescript-eslint/parser',
            parserOptions: {
                ecmaVersion: 'latest',
                project: './tsconfig.json',
            },
            extends: [
                'airbnb-base',
                'airbnb-typescript/base',
                'plugin:@typescript-eslint/recommended',
                'plugin:jsdoc/recommended',
            ],
            plugins: ['@typescript-eslint', 'import', 'jsdoc'],
            rules: {
                '@typescript-eslint/indent': ['error', 4, { SwitchCase: 1 }],
                'max-len': ['error', {
                    code: 80,
                    ignorePattern: '^\\s*(logger\\.|console\\.)',
                    ignoreStrings: true,
                    ignoreComments: true,
                }],
                'import/extensions': ['error', 'never', {
                    js: 'never',
                    ts: 'never',
                }],
                'import/prefer-default-export': 'off',
                'no-continue': 'off',
                'no-await-in-loop': 'off',
                'no-restricted-syntax': 'off',
                'class-methods-use-this': 'off',
                '@typescript-eslint/no-unused-vars': ['error', {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                }],
                '@typescript-eslint/naming-convention': [
                    'error',
                    {
                        selector: 'default',
                        format: ['camelCase'],
                        leadingUnderscore: 'allow',
                        trailingUnderscore: 'allow',
                    },
                    {
                        selector: 'variable',
                        format: ['camelCase', 'UPPER_CASE'],
                        leadingUnderscore: 'allow',
                        trailingUnderscore: 'allow',
                    },
                    {
                        selector: 'typeLike',
                        format: ['PascalCase'],
                    },
                    {
                        selector: 'memberLike',
                        modifiers: ['private'],
                        format: ['camelCase'],
                        leadingUnderscore: 'forbid',
                    },
                    {
                        selector: 'property',
                        format: null,
                    },
                ],
                'jsdoc/check-indentation': 'error',
                'jsdoc/require-param-type': 'off',
                'jsdoc/require-returns-type': 'off',
                'no-restricted-imports': ['error', {
                    patterns: [{
                        group: ['*.js', '*.ts', '../*.js', '../*.ts', './*.js', './*.ts'],
                        message: 'Do not use file extensions in imports. Use module name only.',
                    }],
                }],
            },
        },
    ],
};
