import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import prettierConfig from 'eslint-config-prettier'

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/public/**',
      '**/server/**',
      '**/scripts/**',
      '**/docs/examples/**',
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  ...vue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'vue/multi-word-component-names': 'off',
      'vue/valid-v-show': 'off',
      'vue/no-lone-template': 'off',
      'vue/attributes-order': 'off',
    },
  },

  prettierConfig,
]
