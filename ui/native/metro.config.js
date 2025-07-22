/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const defaultSourceExts =
    require('metro-config/src/defaults/defaults').sourceExts
const defaultAssetExts = require('metro-config/src/defaults/defaults').assetExts
const exclusionList = require('metro-config/src/defaults/exclusionList')
const path = require('path')

module.exports = mergeConfig(getDefaultConfig(__dirname), {
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
        blockList: exclusionList([/.*\/common\/dist\/.*/]),
    },
    watchFolders: [path.resolve(__dirname, '../')],
})
