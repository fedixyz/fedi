// ui/native/tests/configs/jest-functional.config.js
module.exports = {
    // Use the React Native preset for defaults like globals and environment
    preset: 'react-native',

    // <rootDir> → ui/native
    rootDir: '../..',

    // Match any .test.ts(x) under ui/native/tests/**
    testMatch: ['<rootDir>/tests/integration/**/*.test.ts?(x)'],

    // Skip the Detox and Appium test trees
    testPathIgnorePatterns: [
        '<rootDir>/tests/appium/.*',
        '<rootDir>/tests/detox/.*',
    ],

    // Core Babel transform: compile JS/TS via babel-jest
    transform: {
        '^.+\\.[jt]sx?$': 'babel-jest',
    },

    // File extensions Jest will look for
    moduleFileExtensions: [
        'ts', // TypeScript
        'tsx', // TypeScript with JSX
        'js', // JavaScript
        'jsx', // JavaScript with JSX
        'json', // JSON files
        'node', // Node.js modules
    ],

    // Treat .ts/.tsx as ES modules
    extensionsToTreatAsEsm: ['.ts', '.tsx'],

    // Ignore transforming most of node_modules, but allow RN + a few libs through
    transformIgnorePatterns: [
        'node_modules/(?!(jest-)?react-native' +
            '|@react-native' +
            '|react-clone-referenced-element' +
            '|@react-navigation' +
            '|uuid' +
            ')/',
    ],

    // Don’t error if no tests are found (so CI won’t fail on empty dirs)
    passWithNoTests: true,

    // Load mocks/setup before running tests
    setupFiles: ['<rootDir>/tests/setup/jest.setup.mocks.ts'],
}
