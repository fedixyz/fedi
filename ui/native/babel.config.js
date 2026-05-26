module.exports = function (api) {
    const presets = ['module:@react-native/babel-preset']
    const plugins = [
        // Load the react-native-dotenv plugin first
        [
            'module:react-native-dotenv',
            {
                moduleName: '@env',
                path: '.env', // Path to the .env file
                safe: false, // Optional: Ensures variables in .env.example exist in .env
                allowUndefined: true, // Allows undefined variables in .env
            },
        ],
        // React Native Reanimated plugin
        [
            'react-native-reanimated/plugin',
            {
                globals: ['__scanCodes'],
            },
        ],
        // Handle module resolution for specific libraries
        [
            'module-resolver',
            {
                alias: {
                    crypto: 'react-native-quick-crypto',
                    stream: 'stream-browserify',
                    buffer: '@craftzdog/react-native-buffer',
                },
            },
        ],
        // Support export namespace from (TypeScript compatibility)
        '@babel/plugin-proposal-export-namespace-from',
    ]

    // Cache behavior depending on the environment
    if (process?.env?.JEST_WORKER_ID) {
        // Jest environment: Disable cache to allow functional testing without quick-crypto
        api.cache.never()
    } else {
        // React Native environment: Enable cache
        api.cache.forever()
    }

    return {
        presets,
        plugins,
    }
}
