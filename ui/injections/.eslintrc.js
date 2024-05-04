module.exports = {
    root: true,
    extends: ['../.eslintrc.js'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    ignorePatterns: ['dist', 'webpack.*.js'],
}
