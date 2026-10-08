// @ts-check
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const CODE = ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];
const TS = ['**/*.{ts,tsx,mts,cts}'];
const EXT = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const FIXTURES = [`**/*.{test,spec}.${EXT}`, `**/tests/**/*.${EXT}`];

export default defineConfig(
  // ── Ignore generated / config files ───────────────────────────────────────
  {
    ignores: ['**/dist/**', '**/node_modules/**', '.sandbox/**', '.local/**', 'tmp/**'],
  },

  // ── Base rules ─────────────────────────────────────────────────────────────
  { ...js.configs.recommended, files: CODE },
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: c.files ?? CODE })),
  { ...sonarjs.configs.recommended, files: CODE },
  {
    files: CODE,
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'IfStatement[alternate]',
          message:
            'Avoid `else`: a guard clause or early return; `switch` or a lookup for many branches.',
        },
      ],
      'sonarjs/cognitive-complexity': ['warn', 15],
      'max-params': ['warn', 7],
      'max-depth': ['warn', 4],
      'max-nested-callbacks': ['warn', 4],
      'sonarjs/no-nested-conditional': 'warn',
      'sonarjs/no-nested-template-literals': 'warn',
      'sonarjs/prefer-read-only-props': 'warn',
      'sonarjs/deprecation': 'warn',
      'sonarjs/super-linear-regex': 'warn',
      'sonarjs/unused-import': 'warn',
      'sonarjs/prefer-regexp-exec': 'warn',
      'sonarjs/no-redundant-optional': 'warn',
      'sonarjs/duplicates-in-character-class': 'warn',
      'sonarjs/todo-tag': 'warn',
      'sonarjs/no-nested-functions': 'warn',
      'sonarjs/regex-complexity': 'warn',
      'sonarjs/void-use': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/no-empty-test-file': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/different-types-comparison': 'off',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: FIXTURES,
    rules: {
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/hardcoded-secret-signatures': 'off',
      'sonarjs/pseudo-random': 'off',
    },
  },
  {
    files: CODE,
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'unicorn/prefer-global-this': 'warn',
      'unicorn/prefer-at': 'warn',
      'unicorn/prefer-string-replace-all': 'warn',
      'unicorn/prefer-code-point': 'warn',
      'unicorn/no-array-push-push': 'warn',
      'unicorn/prefer-set-has': 'warn',
      'unicorn/no-negated-condition': 'warn',
    },
  },
  {
    files: TS,
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    },
  },

  // ── React + Hooks ──────────────────────────────────────────────────────────
  { ...eslintReact.configs['recommended-typescript'], files: ['apps/*/src/**/*.{ts,tsx}'] },
  {
    files: ['apps/*/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    files: ['apps/*/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-readonly': 'warn',
      '@typescript-eslint/prefer-regexp-exec': 'warn',
    },
  },

  // ── Prettier (must be last — disables conflicting style rules) ─────────────
  prettierConfig,
);
