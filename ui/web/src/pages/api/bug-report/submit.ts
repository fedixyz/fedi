/* eslint-disable no-console */
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

const schema = z.object({
    id: z.string(),
    ticketNumber: z.string(),
    appVersion: z.string().optional(),
    fedimintVersion: z.string().optional(),
    platform: z.string().optional(),
})

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    // CORS header
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Only POST supported' })
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
        // Post to slack after responding, throw if it fails.
        try {
            await postToSlack(body.data)
        } catch (err) {
            console.error('Failed to post to Slack', err)
            throw new Error('Bug report failed to save')
        }

        res.status(200).json({
            slack: true,
        })
    } catch (err) {
        res.status(500).json({
            error: (err as Error).message || (err as object).toString(),
        })
    }
}

async function postToSlack(data: z.infer<typeof schema>) {
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!slackWebhookUrl) {
        console.error(
            'Missing required environment variable for Slack post: SLACK_WEBHOOK_URL',
        )
        throw new Error(
            'Server incorrectly configured for bug report submission',
        )
    }

    const fields = [
        {
            label: 'Upload ID',
            value: '`' + data.id + '`',
        },
        {
            label: 'Support ticket number',
            value: '`' + data.ticketNumber + '`',
        },
        {
            label: 'Platform',
            value: data.platform ? '`' + data.platform + '`' : 'Unknown',
        },
        {
            label: 'Fedi App version',
            value: data.appVersion ? '`' + data.appVersion + '`' : 'Unknown',
        },
        {
            label: 'Fedimint version',
            value: data.fedimintVersion
                ? '`' + data.fedimintVersion + '`'
                : 'Unknown',
        },
    ]

    const s3Url = makeLogsS3Url(data.id)
    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: 'A new bug report has been submitted.',
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: fields
                    .map(({ label, value }) => `*${label}:* ${value}`)
                    .join('\n'),
            },
        },
        {
            type: 'actions',
            elements: [
                s3Url && {
                    type: 'button',
                    url: s3Url,
                    text: {
                        type: 'plain_text',
                        emoji: true,
                        text: ':package: Download logs',
                    },
                },
            ].filter(el => !!el),
        },
    ]

    await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: 'A new bug report has been submitted.',
            blocks,
        }),
    })
}

function makeLogsS3Url(id: string) {
    const region = process.env.AWS_REGION
    const bucket = process.env.AWS_BUG_REPORT_BUCKET_NAME
    if (!region || !bucket) {
        console.warn('Unable to make S3 URL, missing region or bucket name')
        return ''
    }
    const url = `https://s3.console.aws.amazon.com/s3/object/${bucket}?region=${region}&prefix=${id}.tar.gz`
    return `https://fedibtc.awsapps.com/start/#/console?account_id=792500679265&destination=${encodeURIComponent(
        url,
    )}`
}
