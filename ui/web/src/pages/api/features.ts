import type { NextApiRequest, NextApiResponse } from 'next'

import type { RemoteFeatures } from '@fedi/common/types/bindings'

// Keep these values in sync with the compiled-in defaults in
// crates/runtime/src/features.rs so first-launch bridge behavior matches the
// latest remote layer.
const prodRemoteFeatures: RemoteFeatures = {
    dummyFeature: false,
}
const devRemoteFeatures: RemoteFeatures = {
    dummyFeature: true,
}
const isProduction = process.env.VERCEL_ENV === 'production'

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<RemoteFeatures>,
) {
    res.setHeader('Cache-Control', 'no-store')

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET')
        res.status(405).end()
        return
    }

    const remoteFeatures = isProduction ? prodRemoteFeatures : devRemoteFeatures

    res.status(200).json(remoteFeatures)
}
