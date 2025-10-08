import type { NextApiRequest, NextApiResponse } from 'next'

const IS_SURVEY_ENABLED = true
const SURVEY_URL =
    process.env.FEDI_ENV === 'nightly'
        ? 'https://survey.fedi.xyz/would-you-invite-someone-to-use-fedi-nightly'
        : 'https://survey.fedi.xyz/would-you-invite-someone-to-use-fedi'

export default function handler(_: NextApiRequest, res: NextApiResponse) {
    res.status(200).json({
        enabled: IS_SURVEY_ENABLED,
        url: SURVEY_URL,
    })
}
