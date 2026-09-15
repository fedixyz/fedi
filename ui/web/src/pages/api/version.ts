import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<{ version: string }>,
) {
    res.setHeader('Cache-Control', 'no-store')

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET')
        res.status(405).end()
        return
    }

    res.status(200).json({
        version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
    })
}
