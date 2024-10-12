/* eslint-disable no-console */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

const schema = z.object({
    id: z.string(),
})

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    // CORS header
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (req.method === 'OPTIONS') {
        return
    }

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
    const region = process.env.AWS_REGION
    const bucket = process.env.AWS_BUG_REPORT_BUCKET_NAME
    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
        console.error('Missing required environment variable for S3 upload', {
            AWS_ACCESS_KEY_ID: !!accessKeyId,
            AWS_SECRET_ACCESS_KEY: !!secretAccessKey,
            AWS_REGION: !!region,
            AWS_BUG_REPORT_BUCKET_NAME: !!bucket,
        })
        res.status(500).json({
            error: 'Server incorrectly configured for upload',
        })
        return
    }

    const body = schema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).send({
            error: body.error.issues
                .map(issue => `${issue.path[0]}: ${issue.message}`)
                .join(', '),
        })
    }

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
            Key: `${body.data.id}.tar.gz`,
            ContentType: 'application/gzip',
        })
        const url = await getSignedUrl(client, command, { expiresIn: 3600 })
        res.status(200).json({ url })
    } catch (err) {
        res.status(500).json({ error: 'Error generating pre-signed URL' })
    }
}
