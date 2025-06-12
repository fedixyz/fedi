/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
    rootDir: '..',
    testMatch: ['<rootDir>/detox/**/*.test.ts'],
    testPathIgnorePatterns: ['<rootDir>/appium/*'],
    testTimeout: 120000,
    maxWorkers: 1,
    globalSetup: 'detox/runners/jest/globalSetup',
    globalTeardown: 'detox/runners/jest/globalTeardown',
    reporters: ['detox/runners/jest/reporter'],
    testEnvironment: 'detox/runners/jest/testEnvironment',
    verbose: true,
    transform: {
        '^.+\\.(js|jsx|ts|tsx)$': [
            'babel-jest',
            { configFile: './babel.config.js' },
        ],
    },
}
