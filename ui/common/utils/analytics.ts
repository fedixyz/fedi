import { z } from 'zod'

import { API_ORIGIN } from '../constants/api'
import { AnalyticsConsent } from '../types/analytics'
import { makeLog } from './log'

const log = makeLog('common/utils/analytics')

const analyticsUploadResponseSchema = z.object({
    ok: z.boolean(),
})

export const submitAnalyticsConsent = async (
    consentData: Omit<AnalyticsConsent, 'timestamp'>,
): Promise<void> => {
    const timestamp = Date.now()
    const body = { ...consentData, timestamp }
    log.info('Submitting analytics consent', body)

    const url = `${API_ORIGIN}/api/analytics/consent`
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })

        if (!res.ok) {
            throw new Error(
                `Request failed with status ${res.status}: ${res.statusText}`,
            )
        }

        const json = await res.json()
        analyticsUploadResponseSchema.parse(json)
        log.info('Analytics consent uploaded')
    } catch (e) {
        log.error('Analytics consent upload failed', e)
        throw e
    }
}
