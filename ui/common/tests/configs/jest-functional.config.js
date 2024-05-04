/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    rootDir: '..',
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/**/*.test.ts'],
    testPathIgnorePatterns: ['<rootDir>/detox/*'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
}
