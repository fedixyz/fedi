import React from 'react'
import { useTranslation } from 'react-i18next'

import {
    WALLET_SERVICE_RECOVERY_STAGES,
    type WalletServiceRecoveryStage,
} from '@fedi/common/redux'

import { Column } from '../../ui/Flex'
import { MilestoneRow } from './MilestoneRow'

/**
 * The recovery's progress, told the same way formation's and the Lightning
 * attach's are: a checklist of milestone rows rather than a bare spinner.
 *
 * `frozenAt` freezes the checklist at a stage reached before the bridge gave
 * up on the rejoin: only the stages up to and including it render, all
 * marked done, none active. `stage` is ignored once `frozenAt` is set — a
 * frozen checklist has nothing left to be active toward.
 */
export const RecoveryProgress: React.FC<{
    stage: WalletServiceRecoveryStage
    frozenAt?: WalletServiceRecoveryStage
}> = ({ stage, frozenAt }) => {
    const { t } = useTranslation()

    const activeIndex = WALLET_SERVICE_RECOVERY_STAGES.indexOf(stage)
    const stages = frozenAt
        ? WALLET_SERVICE_RECOVERY_STAGES.slice(
              0,
              WALLET_SERVICE_RECOVERY_STAGES.indexOf(frozenAt) + 1,
          )
        : WALLET_SERVICE_RECOVERY_STAGES

    return (
        <Column gap="sm">
            {stages.map((name, index) => (
                <MilestoneRow
                    key={name}
                    label={t(`feature.wallet-service.recovery-stage-${name}`)}
                    detail={t(
                        `feature.wallet-service.recovery-stage-${name}-detail`,
                    )}
                    testID={`recovery-stage-${name}`}
                    detailTestID={`recovery-stage-detail-${name}`}
                    // the final stage is only ever done, never pending:
                    // reaching it is the whole operation completing
                    isActive={
                        !frozenAt && index === activeIndex && stage !== 'ready'
                    }
                    isDone={
                        Boolean(frozenAt) ||
                        index < activeIndex ||
                        (stage === 'ready' && name === 'ready')
                    }
                />
            ))}
        </Column>
    )
}
