/* eslint-disable @typescript-eslint/no-require-imports */
const upstreamTransformer = require('metro-react-native-babel-transformer')
const svgTransformer = require('react-native-svg-transformer')

module.exports.transform = function ({ src, filename, options }) {
    if (filename.endsWith('.svg')) {
        return svgTransformer.transform({ src, filename, options })
    } else {
        return upstreamTransformer.transform({ src, filename, options })
    }
}
