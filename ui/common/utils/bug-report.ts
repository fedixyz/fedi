import { makeLog } from './log'

// When working on the API endpoints locally, comment out which one you want to
// use. Otherwise it'll default to the production endpoint.
const API_ORIGIN =
    process.env.NODE_ENV === 'development'
        ? 'https://fedi-ashen.vercel.app'
        : 'https://app.fedi.xyz'
// const API_ORIGIN = '' // Local PWA (relative path)
// const API_ORIGIN = 'http://localhost:3000' // Local iOS
// const API_ORIGIN = 'http://10.0.2.2:3000' // Local Android

const log = makeLog('common/utils/bug-report')

export async function uploadBugReportLogs(id: string, gzip: Buffer) {
    // Fetch the S3 presigned URL
    const presignedRes = await fetch(
        `${API_ORIGIN}/api/bug-report/generate-upload-url`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id }),
        },
    )
    const json = await presignedRes.json()
    if (json.error) {
        log.error('Failed to get presigned upload url')
        throw new Error(json.error)
    }

    // Upload file to S3 using presigned url
    const presignedUrl = json.url
    const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/tar+gzip',
        },
        body: gzip,
    })
    if (!uploadRes.ok) {
        log.error(
            'Failed to upload logs export to presigned upload url',
            uploadRes,
        )
        throw new Error('Failed to upload logs')
    }
}

export async function submitBugReport(args: {
    id: string // uuid
    ticketNumber?: string // support ticket number
    appVersion?: string
    fedimintVersion?: string
    platform?: string
}) {
    const res = await fetch(`${API_ORIGIN}/api/bug-report/submit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
    })
    const json = await res.json()
    if (json.error) {
        log.error('Failed to submit bug report', res)
        throw new Error(json.error)
    }
}
