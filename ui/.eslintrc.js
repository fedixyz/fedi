module.exports = {
    rules: {
        'curly': 'off',
        'no-shadow': 'off',
        'no-undef': 'off',
        'semi': 'off',
        'react/react-in-jsx-scope': 'off',
        'react-native/no-inline-styles': 'off',
        'no-console': ['error'],
        '@typescript-eslint/no-unused-vars': [
            'error',
            { argsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-non-null-assertion': 'error',
        'no-restricted-imports': [
            'error',
            {
                paths: [
                    {
                        name: 'lodash',
                        message:
                            'Use `lodash/[function-name]` instead to reduce bundle size',
                    },
                ],
            },
        ],
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier',
    ],
    overrides: [
        {
            files: ['*.ts', '*.tsx'],
            rules: {
                '@typescript-eslint/no-shadow': ['error'],
            },
        },
    ],
}
