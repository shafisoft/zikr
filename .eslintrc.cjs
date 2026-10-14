/**
 * ESLint for the React + TypeScript app (the Vue-era config died with the
 * Vue codebase). Kept deliberately lean: correctness rules only — the
 * Noor design system's formatting is Prettier's job, and TS already owns
 * the type-level checks. `npm run lint` runs this over `src`.
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // rules-of-hooks (error) + exhaustive-deps (warn) — the inline
    // `eslint-disable react-hooks/exhaustive-deps` comments across src
    // were written for this rule; it just was never configured here.
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  // Machine output never earns review — the generators stamp their own
  // "DO NOT EDIT" banners and linting them only produces churn.
  ignorePatterns: ['dist', 'dev-dist', 'coverage', '**/*.generated.ts'],
  rules: {
    // The service/store layers use the leading-underscore convention for
    // deliberately-unused parameters (e.g. recalculatePlansForSession's
    // `_operation`).
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
};
