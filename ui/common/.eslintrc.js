module.exports = {
    root: true,
    extends: ['plugin:react-hooks/recommended', '../.eslintrc.js'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    ignorePatterns: ['dist', 'wasm/*.js', 'types/bindings.ts'],
}
