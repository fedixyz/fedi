import { Button, Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import {
    GUARDIAN_TRANSFER_STEPS,
    getGuardianTransferProgress,
} from '@fedi/common/redux'
import { RpcFaGuardianTransfer } from '@fedi/common/types/bindings'

import { Column } from '../../ui/Flex'
import { SafeScrollArea } from '../../ui/SafeArea'
import { WalletServiceFooter } from '../../ui/WalletServiceFooter'
import { WarningBanner } from '../../ui/WarningBanner'
import { MilestoneRow } from './MilestoneRow'
import { WalletServiceScreenHeader } from './WalletServiceScreenHeader'

const STEP_LABEL_KEYS = {
    buyingSeat: 'feature.wallet-service.transfer-step-buying-seat',
    awaitingSource: 'feature.wallet-service.transfer-step-awaiting-source',
    publishingBinding:
        'feature.wallet-service.transfer-step-publishing-binding',
    removingSource: 'feature.wallet-service.transfer-step-removing-source',
} as const satisfies Record<(typeof GUARDIAN_TRANSFER_STEPS)[number], string>

const STEP_DETAIL_KEYS = {
    buyingSeat: 'feature.wallet-service.transfer-step-buying-seat-detail',
    awaitingSource:
        'feature.wallet-service.transfer-step-awaiting-source-detail',
    publishingBinding:
        'feature.wallet-service.transfer-step-publishing-binding-detail',
    removingSource:
        'feature.wallet-service.transfer-step-removing-source-detail',
} as const satisfies Record<(typeof GUARDIAN_TRANSFER_STEPS)[number], string>

const STEP_DONE_DETAIL_KEYS = {
    buyingSeat: 'feature.wallet-service.transfer-step-buying-seat-done',
    awaitingSource: 'feature.wallet-service.transfer-step-awaiting-source-done',
    publishingBinding:
        'feature.wallet-service.transfer-step-publishing-binding-done',
    removingSource: 'feature.wallet-service.transfer-step-removing-source-done',
} as const satisfies Record<(typeof GUARDIAN_TRANSFER_STEPS)[number], string>

/** The four steps, each done before `current`. */
const TransferSteps: React.FC<{
    current: number
    names: { source: string; destination: string }
}> = ({ current, names }) => {
    const { t } = useTranslation()
    return (
        <>
            {GUARDIAN_TRANSFER_STEPS.map((step, index) => {
                const isDone = index < current
                const detailKeys = isDone
                    ? STEP_DONE_DETAIL_KEYS
                    : STEP_DETAIL_KEYS
                return (
                    <MilestoneRow
                        key={step}
                        label={t(STEP_LABEL_KEYS[step])}
                        detail={t(detailKeys[step], names)}
                        isActive={index === current}
                        isDone={isDone}
                        recede={false}
                        testID={`transfer-step-${step}`}
                        detailTestID={`transfer-step-${step}-detail`}
                    />
                )
            })}
        </>
    )
}

/**
 * The steps of a guardian replacement: where an open one stands, or, once a
 * replacement this screen watched has finished, that it is done.
 */
export const GuardianTransferProgress: React.FC<{
    transfer: RpcFaGuardianTransfer
    isFinished: boolean
    onReturnHome: () => void
}> = ({ transfer, isFinished, onReturnHome }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { current } = getGuardianTransferProgress(transfer.phase)
    const names = {
        source: transfer.sourceMgName,
        destination: transfer.destinationMgName,
    }

    return (
        <>
            <WalletServiceScreenHeader
                backButton
                title={t(
                    isFinished
                        ? 'feature.wallet-service.transfer-done-title'
                        : 'feature.wallet-service.transfer-progress-title',
                    { name: names.source, source: names.source },
                )}>
                {!isFinished && transfer.phase === 'awaitingSource' ? (
                    <WarningBanner
                        level="info"
                        icon="Info"
                        title={t(
                            'feature.wallet-service.transfer-waiting-title',
                            names,
                        )}
                        message={t(
                            'feature.wallet-service.transfer-waiting-body',
                            names,
                        )}
                    />
                ) : null}
            </WalletServiceScreenHeader>
            <SafeScrollArea edges="notop" padding="lg">
                <Column gap="md">
                    <Text
                        caption
                        color={theme.colors.darkGrey}
                        testID={
                            isFinished ? 'transfer-done-body' : 'transfer-rule'
                        }>
                        {isFinished
                            ? t(
                                  'feature.wallet-service.transfer-done-body',
                                  names,
                              )
                            : t('feature.wallet-service.transfer-moving')}
                    </Text>
                    <TransferSteps
                        current={
                            isFinished
                                ? GUARDIAN_TRANSFER_STEPS.length
                                : current
                        }
                        names={names}
                    />
                </Column>
            </SafeScrollArea>
            <WalletServiceFooter>
                {isFinished ? (
                    <Button
                        // a new button, not the outline one restyled: the
                        // fill does not draw on a button that changes style
                        key="done"
                        fullWidth
                        testID="transfer-finished-button"
                        title={t('words.done')}
                        onPress={onReturnHome}
                    />
                ) : (
                    <Button
                        key="return-home"
                        fullWidth
                        outline
                        testID="return-home-button"
                        title={t('phrases.return-to-home')}
                        onPress={onReturnHome}
                    />
                )}
            </WalletServiceFooter>
        </>
    )
}
