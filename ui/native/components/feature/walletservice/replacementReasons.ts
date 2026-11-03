import { TFunction } from 'i18next'

import type { RpcFaReplacementReason } from '@fedi/common/types/bindings'
import dateUtils from '@fedi/common/utils/DateUtils'

const formatPercent = (basisPoints: number) =>
    `${Math.floor(basisPoints / 100)}%`

/**
 * Most telling first. A revoked holder or a dropped connection rules the
 * guardian out on its own; an uptime score is the measure the check flags
 * on; missed sessions and the last time seen explain a score but say less
 * alone.
 */
const REASON_RANK: RpcFaReplacementReason['type'][] = [
    'holderRevoked',
    'disconnected',
    'lowWeekScore',
    'lowMonthScore',
    'missedSessions',
    'offline',
]

/** The reason to show when there is room for one. */
export const mostRelevantReason = (
    reasons: RpcFaReplacementReason[],
): RpcFaReplacementReason | undefined =>
    [...reasons].sort(
        (a, b) => REASON_RANK.indexOf(a.type) - REASON_RANK.indexOf(b.type),
    )[0]

/** One reason a guardian was flagged, as one plain sentence. */
export const describeReplacementReason = (
    reason: RpcFaReplacementReason,
    t: TFunction,
) => {
    switch (reason.type) {
        case 'offline':
            return t('feature.wallet-service.replace-reason-offline', {
                time: dateUtils.formatDeviceRegistrationTimestamp(
                    reason.lastSeenSecs,
                ),
            })
        case 'missedSessions':
            return t('feature.wallet-service.replace-reason-missed-sessions', {
                count: reason.sessions,
            })
        case 'disconnected':
            return t('feature.wallet-service.replace-reason-disconnected')
        case 'lowWeekScore':
            return t('feature.wallet-service.replace-reason-week', {
                percent: formatPercent(reason.basisPoints),
            })
        case 'lowMonthScore':
            return t('feature.wallet-service.replace-reason-month', {
                percent: formatPercent(reason.basisPoints),
            })
        case 'holderRevoked':
            return t('feature.wallet-service.replace-reason-revoked')
    }
}

/**
 * One reason a guardian was flagged as a summary row: what was measured, and
 * the number, as every summary in the setup flow reads.
 */
export const summarizeReplacementReason = (
    reason: RpcFaReplacementReason,
    t: TFunction,
) => {
    switch (reason.type) {
        case 'offline':
            return {
                label: t('feature.wallet-service.replace-summary-offline'),
                value: dateUtils.formatDeviceRegistrationTimestamp(
                    reason.lastSeenSecs,
                ),
            }
        case 'missedSessions':
            return {
                label: t(
                    'feature.wallet-service.replace-summary-missed-sessions',
                ),
                value: String(reason.sessions),
            }
        case 'disconnected':
            return {
                label: t('feature.wallet-service.replace-summary-disconnected'),
                value: t(
                    'feature.wallet-service.replace-summary-disconnected-value',
                ),
            }
        case 'lowWeekScore':
            return {
                label: t('feature.wallet-service.replace-summary-week'),
                value: formatPercent(reason.basisPoints),
            }
        case 'lowMonthScore':
            return {
                label: t('feature.wallet-service.replace-summary-month'),
                value: formatPercent(reason.basisPoints),
            }
        case 'holderRevoked':
            return {
                label: t('feature.wallet-service.replace-summary-revoked'),
                value: t(
                    'feature.wallet-service.replace-summary-revoked-value',
                ),
            }
    }
}

/**
 * What a replacement means for payments: they keep working while enough
 * guardians respond, and stop until one is replaced or back otherwise. Null
 * while the guardians are not read yet, so nothing is claimed.
 */
export const replacementQuorumLine = (
    hasQuorum: boolean | null,
    t: TFunction,
) =>
    hasQuorum === null
        ? null
        : hasQuorum
          ? t('feature.wallet-service.replacement-keeps-working')
          : t('feature.wallet-service.replacement-below-quorum')
