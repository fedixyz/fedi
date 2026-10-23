/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const path = require('path')

const defaultConfig = getDefaultConfig(__dirname)
const defaultSourceExts = defaultConfig.resolver.sourceExts
const defaultAssetExts = defaultConfig.resolver.assetExts

module.exports = mergeConfig(defaultConfig, {
    transformer: {
        babelTransformerPath: require.resolve('./custom-metro-transformer.js'),
        getTransformOptions: async () => ({
            transform: {
                experimentalImportSupport: false,
                inlineRequires: true,
            },
        }),
    },
    resolver: {
        assetExts: defaultAssetExts.filter(ext => ext !== 'svg'),
        sourceExts: [...defaultSourceExts, 'svg'],
        nodeModulesPaths: [
            path.resolve(__dirname, './node_modules'),
            path.resolve(__dirname, '../node_modules'),
        ],
        extraNodeModules: {
            '@fedi/common': path.resolve(__dirname, '../common'),
            '@fedi/injections': path.resolve(__dirname, '../injections'),
        },
        // Ignore @fedi/common/dist/*
        blockList: /.*\/common\/dist\/.*/,
    },
    watchFolders: [path.resolve(__dirname, '../')],
})
