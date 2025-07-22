/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@fedi/common'],
    webpack(config) {
        config.experiments = { asyncWebAssembly: true, layers: true }
        config.module.rules.push({
            test: /\.svg$/i,
            issuer: /\.[jt]sx?$/,
            use: [
                {
                    loader: '@svgr/webpack',
                    options: {
                        dimensions: false,
                    },
                },
            ],
        })

        return config
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },
}

const withPwa = require('next-pwa')({
    dest: 'public',
    customWorkerDir: 'src/worker',
})

const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: !!process.env.ANALYZE_BUILD,
})

module.exports = withBundleAnalyzer(withPwa(nextConfig))
