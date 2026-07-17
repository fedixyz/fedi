import type { KnipConfig } from 'knip'

const config: KnipConfig = {
    ignoreDependencies: ['@fedi/common'],
    ignoreExportsUsedInFile: true,
    ignore: [
        './common/wasm/**',
        './native/bridge/remote.ts',
        './web/.next',
        './web/src/lib/bridge/log.ts',
        './web/src/lib/bridge/remote.ts',
    ],
    ignoreMembers: ['SupportedCurrency'],
    workspaces: {
        common: {
            entry: [
                'assets/svgs/index.ts',
                'hooks/amount/index.ts',
                'localization/index.ts',
                'redux/index.ts',
                'tests/**/*.{js,ts,tsx}',
                'types/index.ts',
            ],
            project: ['**/*.{js,ts,tsx}'],
        },
        injections: {
            entry: ['src/injectables/*.ts'],
            project: ['src/**/*.ts'],
            webpack: false,
        },
        native: {
            entry: [
                '.detoxrc.js',
                'App.tsx',
                'react-native.config.js',
                'scripts/**/*.{js,ts}',
                'tests/**/*.{js,ts,tsx}',
            ],
            project: ['**/*.{js,ts,tsx}'],
        },
        web: {
            entry: [
                '__mocks__/**/*.js',
                'jest.setup.js',
                'src/lib/bridge/wasm.worker.ts',
                'src/pages/**/*.{ts,tsx}',
                'src/worker/index.ts',
                'tests/**/*.{js,ts,tsx}',
            ],
            project: ['**/*.{js,ts,tsx}'],
        },
    },
    rules: {
        binaries: 'off',
        enumMembers: 'off',
        classMembers: 'off',
        dependencies: 'off',
        devDependencies: 'off',
        duplicates: 'off',
        exports: 'off',
        nsExports: 'off',
        optionalPeerDependencies: 'off',
        types: 'off',
        nsTypes: 'off',
        unlisted: 'off',
        unresolved: 'off',
    },
}

export default config
