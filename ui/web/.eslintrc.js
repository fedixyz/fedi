module.exports = {
    root: true,
    extends: ['next/core-web-vitals', '../.eslintrc.js'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    overrides: [
        {
            // Playwright fixtures take a `use` callback that react-hooks
            // mistakes for a hook. e2e code isn't React.
            files: ['tests/e2e/**'],
            rules: { 'react-hooks/rules-of-hooks': 'off' },
        },
    ],
}
