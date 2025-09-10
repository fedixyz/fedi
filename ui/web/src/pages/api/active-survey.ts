import type { NextApiRequest, NextApiResponse } from 'next'

const IS_SURVEY_ENABLED = false
const SURVEY_URL = 'https://survey-test.fedi.xyz/interrogation'

export default function handler(_: NextApiRequest, res: NextApiResponse) {
    res.status(200).json({
        enabled: IS_SURVEY_ENABLED,
        url: SURVEY_URL,
    })
}
