import type { KnipConfig } from 'knip'
const config: KnipConfig = {
    ignoreDependencies: ['@fedi/common'],
    ignoreExportsUsedInFile: true,
    ignore: ['./web/.next'],
    ignoreMembers: ['SupportedCurrency'],
    rules: {
        enumMembers: 'off',
        classMembers: 'off',
    },
}

export default config
