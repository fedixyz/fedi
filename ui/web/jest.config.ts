import nextJest from 'next/jest.js'

const customJestConfig = {
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testEnvironment: 'jest-environment-jsdom',
}

const createJestConfig = nextJest({
    dir: './tests',
})

const jestConfig = async () => {
    const nextJestConfig = await createJestConfig(customJestConfig)()
    return {
        ...nextJestConfig,
        moduleNameMapper: {
            // required to make svg mock work
            '\\.svg$': '<rootDir>/__mocks__/svg.js',
            ...nextJestConfig.moduleNameMapper,
        },
    }
}

export default jestConfig
