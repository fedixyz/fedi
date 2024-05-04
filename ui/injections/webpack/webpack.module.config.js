const path = require('path')
const fs = require('fs')
const webpack = require('webpack')

const dist = path.join(__dirname, '../dist')

// Generate a `webpack.DefinePlugin` that replaces some environment variables
// with the contents of the injectable scripts as strings. In development, the
// replacement is updated every time the file changes. In the production build,
// the file is read once and compiled with the contents.
const makeInjectableDefinePlugin = isProd => {
    const makeInjection = filename => {
        const file = path.join(dist, `injectables/${filename}.js`)
        const fileToStr = () =>
            JSON.stringify(`${fs.readFileSync(file, 'utf8')}`)

        if (isProd) {
            return fileToStr()
        } else {
            return webpack.DefinePlugin.runtimeValue(fileToStr, {
                fileDependencies: [file],
            })
        }
    }

    return new webpack.DefinePlugin({
        'process.env.INJECTION_WEBLN': makeInjection('webln'),
        'process.env.INJECTION_ERUDA': makeInjection('eruda'),
        'process.env.INJECTION_NOSTR': makeInjection('nostr'),
        'process.env.INJECTION_FEDI_INTERNAL': makeInjection('fediInternal'),
    })
}

module.exports = env => ({
    mode: env.prod ? 'production' : 'development',
    devtool: false,
    entry: {
        index: path.join(__dirname, '../src/index.ts'),
    },
    output: {
        path: dist,
        filename: '[name].js',
        library: {
            type: 'commonjs2',
        },
    },
    experiments: {
        outputModule: true,
    },
    resolve: {
        extensions: ['.ts'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [makeInjectableDefinePlugin(env.prod ? false : true)],
})
