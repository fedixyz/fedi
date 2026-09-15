import bundleAnalyzer from '@next/bundle-analyzer'
import type { NextConfig } from 'next'
import nextPwa from 'next-pwa'

import { version as appVersion } from './package.json'

const nextConfig: NextConfig = {
    devIndicators: false,
    env: {
        NEXT_PUBLIC_APP_VERSION: appVersion,
    },
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

const withPwa = nextPwa({
    dest: 'public',
    customWorkerDir: 'src/worker',
    disable: process.env.NODE_ENV === 'development',
})

const withBundleAnalyzer = bundleAnalyzer({
    enabled: !!process.env.ANALYZE_BUILD,
})

export default withBundleAnalyzer(withPwa(nextConfig))
