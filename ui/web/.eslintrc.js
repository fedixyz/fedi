module.exports = {
    root: true,
    extends: [
        'next/core-web-vitals',
        'plugin:react-hooks/recommended',
        '../.eslintrc.js',
    ],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
}
