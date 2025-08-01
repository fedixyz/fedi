// eslint-disable-next-line @typescript-eslint/no-require-imports
const baseConfig = require('../.eslintrc.js')

module.exports = {
    root: true,
    extends: ['@react-native', '../.eslintrc.js'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    rules: {
        // The react-navigation library used in native takes nested components
        // defined as props but none of those instances use the props as
        // rendered elements which would impact virtual DOM performance so this
        // option to remove these warnings should be safe
        'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
        'no-restricted-imports': [
            'error',
            {
                paths: [
                    ...baseConfig.rules['no-restricted-imports'][1].paths,
                    {
                        name: '@rneui/themed',
                        importNames: ['Icon'],
                        message: 'Use <SvgImage /> for icons instead',
                    },
                ],
            },
        ],
        '@typescript-eslint/ban-ts-comment': 'warn',
    },
    overrides: [
        {
            files: ['*.js'],
            rules: {
                '@typescript-eslint/no-var-requires': 'off',
            },
        },
    ],
}
