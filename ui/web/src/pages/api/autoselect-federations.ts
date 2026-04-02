import type { NextApiRequest, NextApiResponse } from 'next'

import autoselectNightly from '../../../public/meta-autoselect-federations-nightly.json'
import autoselectProduction from '../../../public/meta-autoselect-federations.json'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
    const isNightly = process.env.FEDI_ENV === 'nightly'
    const data = isNightly ? autoselectNightly : autoselectProduction

    res.setHeader('Cache-Control', 'no-cache')
    res.status(200).json(data)
}
