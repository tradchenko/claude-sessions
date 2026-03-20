// ESLint flat config с unified API (typescript-eslint/strict)
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
   // Глобальные игноры
   {
      ignores: ['dist/**', 'build/**', 'node_modules/**', '.planning/**', '.claude/**'],
   },

   // Правила для src/**/*.ts — strict TypeScript
   {
      files: ['src/**/*.ts'],
      extends: [...tseslint.configs.strict],
      plugins: {
         'import-x': importX,
      },
      languageOptions: {
         parserOptions: {
            project: './tsconfig.json',
         },
      },
      settings: {
         'import-x/resolver': {
            typescript: {
               project: './tsconfig.json',
            },
         },
      },
      rules: {
         // CLI-инструмент — console допустим
         'no-console': 'off',

         // Порядок импортов: builtin → external → internal
         'import-x/order': [
            'error',
            {
               groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
               'newlines-between': 'never',
            },
         ],

         // node: prefix для встроенных модулей
         'import-x/no-nodejs-modules': 'off',

         // Отключаем базовый no-unused-vars в пользу TS-версии
         'no-unused-vars': 'off',
         '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

         // Разрешаем explicit any с предупреждением
         '@typescript-eslint/no-explicit-any': 'warn',
      },
   },

   // Правила для tests/**/*.mjs — базовые без TypeScript parser
   {
      files: ['tests/**/*.mjs'],
      rules: {
         'no-console': 'off',
         'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      },
   },

   // eslint-config-prettier последним — отключает конфликтующие правила
   prettier,
);
