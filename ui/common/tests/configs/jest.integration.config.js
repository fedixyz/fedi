/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    rootDir: '..',
    preset: 'ts-jest',
    testEnvironment: './environment.ts',
    testMatch: ['**/tests/integration/**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/utils/setup.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    transform: {
        '^.+\\.(ts|tsx)$': [
            'ts-jest',
            {
                tsconfig: {
                    jsx: 'react-jsx',
                },
            },
        ],
    },
    transformIgnorePatterns: ['node_modules/(?!(.*\\.(mjs|jsx?|tsx?)$))'],
    testTimeout: 30000,
}
