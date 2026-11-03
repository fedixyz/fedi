import { Button, Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { RpcFaReplacementCandidate } from '@fedi/common/types/bindings'
import dateUtils from '@fedi/common/utils/DateUtils'

import { Column } from '../../ui/Flex'
import { SafeScrollArea } from '../../ui/SafeArea'
import { WalletServiceFooter } from '../../ui/WalletServiceFooter'
import { WarningBanner } from '../../ui/WarningBanner'
import {
    ServiceActionRow,
    ServiceSettingsDivider,
    ServiceSettingsSection,
} from './ServiceSettingsRow'
import { WalletServiceScreenHeader } from './WalletServiceScreenHeader'
import {
    describeReplacementReason,
    mostRelevantReason,
    replacementQuorumLine,
} from './replacementReasons'

/**
 * The guardians a replacement can start from: the ones the latest check
 * flagged. A guardian that is only offline is not offered.
 */
export const GuardianTransferSeatList: React.FC<{
    candidates: RpcFaReplacementCandidate[]
    /** When the latest check finished; null before the first one. */
    checkedAt: number | null
    hasQuorum: boolean | null
    /** Why the last pick came back to the list, said in place. */
    notice: string | null
    disabled: boolean
    onSelect: (seatIndex: number) => void
    onDone: () => void
}> = ({
    candidates,
    checkedAt,
    hasQuorum,
    notice,
    disabled,
    onSelect,
    onDone,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    return (
        <>
            <WalletServiceScreenHeader
                backButton
                title={t('feature.wallet-service.transfer-title')}>
                {notice ? (
                    <WarningBanner level="info" message={notice} />
                ) : null}
            </WalletServiceScreenHeader>
            <SafeScrollArea edges="notop" padding="lg">
                <Column gap="lg">
                    <Text caption color={theme.colors.darkGrey}>
                        {[
                            t('feature.wallet-service.transfer-pick-body'),
                            replacementQuorumLine(hasQuorum, t),
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    </Text>
                    {candidates.length > 0 ? (
                        <ServiceSettingsSection
                            title={t('feature.wallet-service.guardians-label')}>
                            {candidates.map((candidate, position) => {
                                const reason = mostRelevantReason(
                                    candidate.reasons,
                                )
                                return (
                                    <View key={candidate.seatIndex}>
                                        {position > 0 && (
                                            <ServiceSettingsDivider />
                                        )}
                                        <ServiceActionRow
                                            icon="User"
                                            name={candidate.mgName}
                                            detail={
                                                reason &&
                                                describeReplacementReason(
                                                    reason,
                                                    t,
                                                )
                                            }
                                            disabled={disabled}
                                            onPress={() =>
                                                onSelect(candidate.seatIndex)
                                            }
                                            testID={`transfer-seat-${candidate.seatIndex}`}
                                        />
                                    </View>
                                )
                            })}
                        </ServiceSettingsSection>
                    ) : (
                        <WarningBanner
                            level="info"
                            title={
                                checkedAt === null
                                    ? undefined
                                    : t(
                                          'feature.wallet-service.transfer-none-flagged-title',
                                      )
                            }
                            message={
                                checkedAt === null
                                    ? t(
                                          'feature.wallet-service.transfer-not-checked-body',
                                      )
                                    : t(
                                          'feature.wallet-service.transfer-none-flagged-body',
                                          {
                                              time: dateUtils.formatDeviceRegistrationTimestamp(
                                                  checkedAt,
                                              ),
                                          },
                                      )
                            }
                        />
                    )}
                </Column>
            </SafeScrollArea>
            <WalletServiceFooter>
                <Button
                    fullWidth
                    outline
                    testID="transfer-done-button"
                    title={t('words.done')}
                    onPress={onDone}
                />
            </WalletServiceFooter>
        </>
    )
}
