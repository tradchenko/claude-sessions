// ESLint flat config (ESLint v9+/v10)
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
   {
      // Игнорируемые директории
      ignores: ['dist/**', 'node_modules/**', 'test/**', 'tests/**'],
   },
   {
      files: ['src/**/*.ts'],
      languageOptions: {
         parser: tsparser,
         parserOptions: {
            project: './tsconfig.json',
            ecmaVersion: 2022,
            sourceType: 'module',
         },
      },
      plugins: {
         '@typescript-eslint': tseslint,
      },
      rules: {
         // Базовые правила из eslint:recommended
         'no-unused-vars': 'off', // Отключаем в пользу TS-версии
         'no-undef': 'off', // TypeScript сам проверяет

         // TypeScript-specific правила
         '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
         '@typescript-eslint/no-explicit-any': 'warn',
         '@typescript-eslint/no-require-imports': 'error',
      },
   },
];
