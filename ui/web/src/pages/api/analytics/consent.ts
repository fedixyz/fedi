/* eslint-disable no-console */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

import { AnalyticsConsent } from '@fedi/common/types/analytics'

const schema = z.object({
    consent: z.boolean(),
    analyticsId: z.string(),
    timestamp: z.number(),
    voteMethod: z.enum([
        'modal-accept',
        'modal-reject',
        'modal-dismiss',
        'settings-update',
    ]),
    appFlavor: z.enum(['bravo', 'dev', 'nightly', 'tests']),
}) satisfies z.ZodType<AnalyticsConsent>

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    // CORS header
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (req.method === 'OPTIONS') {
        return
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' })
        return
    }

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
    const region = process.env.AWS_REGION
    const bucket = process.env.AWS_ANALYTICS_CONSENT_BUCKET_NAME
    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
        console.error('Missing required environment variable for S3 upload', {
            AWS_ACCESS_KEY_ID: !!accessKeyId,
            AWS_SECRET_ACCESS_KEY: !!secretAccessKey,
            AWS_REGION: !!region,
            AWS_ANALYTICS_CONSENT_BUCKET_NAME: !!bucket,
        })
        res.status(500).json({
            error: 'Server incorrectly configured for upload',
        })
        return
    }

    const body = schema.safeParse(req.body)
    if (!body.success) {
        console.error('Invalid request body', body.error)
        return res.status(400).send({
            error: body.error.issues
                .map(issue => `${issue.path[0]}: ${issue.message}`)
                .join(', '),
        })
    }

    const { analyticsId, timestamp } = body.data

    const date = new Date(timestamp)
    const yyyy = date.getUTCFullYear().toString()
    const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0')
    const dd = date.getUTCDate().toString().padStart(2, '0')
    const isoDate = `${yyyy}${mm}${dd}`
    const id = `${isoDate}/${analyticsId}`

    try {
        const client = new S3Client({
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        })
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: `${id}.json`,
            ContentType: 'application/json',
            Body: JSON.stringify({
                event: 'analytics-consent',
                ...body.data,
            }),
        })
        await client.send(command)
        res.status(200).json({ ok: true })
    } catch (err) {
        console.error('err', err)
        res.status(500).json({ error: 'Error uploading analytics consent' })
    }
}
