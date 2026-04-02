import type { NextApiRequest, NextApiResponse } from 'next'

import federationsNightly from '../../../public/meta-federations-nightly.json'
import federationsProduction from '../../../public/meta-federations.json'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
    const isNightly = process.env.FEDI_ENV === 'nightly'
    const data = isNightly ? federationsNightly : federationsProduction

    res.setHeader('Cache-Control', 'no-cache')
    res.status(200).json(data)
}
