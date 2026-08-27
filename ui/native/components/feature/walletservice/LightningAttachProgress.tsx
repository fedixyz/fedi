import React from 'react'
import { useTranslation } from 'react-i18next'

import {
    WALLET_SERVICE_LIGHTNING_STAGES,
    type WalletServiceLightningStage,
} from '@fedi/common/redux'

import { Column } from '../../ui/Flex'
import { MilestoneRow } from './MilestoneRow'

const STAGE_COPY = {
    requested: {
        labelKey: 'feature.wallet-service.lightning-stage-requested',
        detailKey: 'feature.wallet-service.lightning-stage-requested-detail',
    },
    allocating: {
        labelKey: 'feature.wallet-service.lightning-stage-allocating',
        detailKey: 'feature.wallet-service.lightning-stage-allocating-detail',
    },
    providerComplete: {
        labelKey: 'feature.wallet-service.lightning-stage-provider-complete',
        detailKey:
            'feature.wallet-service.lightning-stage-provider-complete-detail',
    },
    verifying: {
        labelKey: 'feature.wallet-service.lightning-stage-verifying',
        detailKey: 'feature.wallet-service.lightning-stage-verifying-detail',
    },
    ready: {
        labelKey: 'feature.wallet-service.lightning-stage-ready',
        detailKey: 'feature.wallet-service.lightning-stage-ready-detail',
    },
    actionRequired: {
        labelKey: 'feature.wallet-service.lightning-stage-action-required',
        detailKey:
            'feature.wallet-service.lightning-stage-action-required-detail',
    },
} as const satisfies Record<
    WalletServiceLightningStage,
    { labelKey: string; detailKey: string }
>

/**
 * The attach's progress, told the same way the formation's is.
 *
 * The attach does not stream — it is polled every few seconds — but the polled
 * snapshot already carries per-item phases, so the line is derived from the
 * operation on every read rather than accumulated locally. A later poll can
 * therefore correct it, which a running tally could not.
 *
 * `actionRequired` replaces the list rather than appearing inside it. Its
 * contract calls it an operator decision point and forbids automatic retry, so
 * showing it as one lit step among five would present a stop as progress.
 *
 * `providerComplete` and everything before it is provider-authored. Only
 * `ready` is `gatewayViewVerified`, and only it may read as done.
 */
export const LightningAttachProgress: React.FC<{
    stage: WalletServiceLightningStage
}> = ({ stage }) => {
    const { t } = useTranslation()

    if (stage === 'actionRequired') {
        const copy = STAGE_COPY.actionRequired
        return (
            <Column gap="sm">
                <MilestoneRow
                    label={t(copy.labelKey)}
                    detail={t(copy.detailKey)}
                    testID="lightning-stage-actionRequired"
                    detailTestID="lightning-stage-detail-actionRequired"
                    isActive
                    isDone={false}
                />
            </Column>
        )
    }

    const activeIndex = WALLET_SERVICE_LIGHTNING_STAGES.indexOf(stage)

    return (
        <Column gap="sm">
            {WALLET_SERVICE_LIGHTNING_STAGES.map((name, index) => {
                const copy = STAGE_COPY[name]
                return (
                    <MilestoneRow
                        key={name}
                        label={t(copy.labelKey)}
                        detail={t(copy.detailKey)}
                        testID={`lightning-stage-${name}`}
                        detailTestID={`lightning-stage-detail-${name}`}
                        // the final stage is only ever done, never pending:
                        // reaching it is the whole operation completing
                        isActive={index === activeIndex && stage !== 'ready'}
                        isDone={
                            index < activeIndex ||
                            (stage === 'ready' && name === 'ready')
                        }
                    />
                )
            })}
        </Column>
    )
}
