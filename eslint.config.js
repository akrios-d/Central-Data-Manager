// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      // Allow _prefix for intentionally unused destructuring variables
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Downgrade any to warning — useful to track but not block CI
      '@typescript-eslint/no-explicit-any': 'warn',
      // Angular effects track signals via bare calls — this rule conflicts with that pattern
      '@typescript-eslint/no-unused-expressions': 'off',
      // Empty arrow functions are idiomatic in subscribe error callbacks
      '@typescript-eslint/no-empty-function': 'off',
      // Use T[] style (auto-fixable)
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
    },
  },
  {
    files: ['**/*.html'],
    // templateAccessibility adds a11y rules that are too strict for an interactive SPA
    // (kanban drag-drop, graph nodes, custom controls all use div click handlers)
    extends: [angular.configs.templateRecommended],
    rules: {},
  },
]);
