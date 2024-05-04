module.exports = function (api) {
    const presets = ['module:metro-react-native-babel-preset']
    const plugins = [
        [
            'react-native-reanimated/plugin',
            {
                globals: ['__scanCodes'],
            },
        ],
    ]

    // We also need to handle `export * from` from TypeScript since we're not using ts-jest
    plugins.push('@babel/plugin-proposal-export-namespace-from')

    if (process?.env?.JEST_WORKER_ID) {
        // we are inside jest functional tests, don't use react-native-quick-crypto
        // so we can fallback to NodeJS
        api.cache.never()
    } else {
        // we are inside RN, so we need to provide react-native-quick-crypto aliases
        plugins.unshift([
            'module-resolver',
            {
                alias: {
                    crypto: 'react-native-quick-crypto',
                    stream: 'stream-browserify',
                    buffer: '@craftzdog/react-native-buffer',
                },
            },
        ])
        api.cache.forever()
    }

    return {
        presets,
        plugins,
    }
}
