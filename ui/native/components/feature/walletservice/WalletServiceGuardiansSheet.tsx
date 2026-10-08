import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'

import { LoadedFederation } from '@fedi/common/types'
import type { GuardianStatus } from '@fedi/common/types/bindings'
import {
    guardianQuorum,
    readGuardianStatus,
} from '@fedi/common/utils/federationHealth'

import { Column, Row } from '../../ui/Flex'
import { ScreenTitle } from '../../ui/ScreenTitle'
import { SheetDescription } from '../../ui/SheetDescription'
import { WarningBanner } from '../../ui/WarningBanner'
import { ServiceSheet } from './ServiceSheet'

export const GuardiansOfflineBanner: React.FC<{ total: number }> = ({
    total,
}) => {
    const { t } = useTranslation()
    return (
        <WarningBanner
            level="error"
            message={t('feature.wallet-service.federation-offline', {
                quorum: guardianQuorum(total),
                total,
            })}
        />
    )
}

export const WalletServiceGuardiansSheet: React.FC<{
    show: boolean
    statuses: GuardianStatus[]
    federationStatus: LoadedFederation['status']
    statusColor: string
    onDismiss: () => void
}> = ({ show, statuses, federationStatus, statusColor, onDismiss }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    const guardians = statuses
        .map((guardian, index) => ({
            ...readGuardianStatus(guardian),
            seat: index + 1,
        }))
        .sort((a, b) => Number(a.isResponding) - Number(b.isResponding))
    const total = guardians.length
    const online = guardians.filter(g => g.isResponding).length

    return (
        <ServiceSheet
            show={show}
            tall
            onDismiss={onDismiss}
            buttons={[
                {
                    text: t('words.done'),
                    primary: true,
                    onPress: onDismiss,
                },
            ]}>
            <Column gap="xs">
                <Row align="center" gap="sm">
                    <Row
                        testID="wallet-service-guardians-status-dot"
                        style={[style.dot, { backgroundColor: statusColor }]}
                    />
                    <ScreenTitle>
                        {t('feature.wallet-service.guardians-count', {
                            online,
                            total,
                        })}
                    </ScreenTitle>
                </Row>
                {federationStatus === 'offline' ? (
                    <GuardiansOfflineBanner total={total} />
                ) : (
                    <SheetDescription>
                        {online === total
                            ? t('feature.wallet-service.federation-online')
                            : t(
                                  'feature.wallet-service.federation-online-degraded',
                                  { quorum: guardianQuorum(total), total },
                              )}
                    </SheetDescription>
                )}
            </Column>
            <ScrollView
                testID="wallet-service-guardians-list"
                style={style.list}>
                {guardians.map((guardian, index) => (
                    <Row
                        key={guardian.guardian}
                        align="center"
                        gap="sm"
                        testID={`wallet-service-guardian-${index}`}
                        style={style.row}>
                        <Row
                            style={[
                                style.dot,
                                {
                                    backgroundColor: guardian.isResponding
                                        ? theme.colors.success
                                        : theme.colors.orange,
                                },
                            ]}
                        />
                        <Text
                            caption
                            color={theme.colors.black}
                            numberOfLines={1}
                            style={style.name}>
                            {guardian.fman_name ??
                                t(
                                    'feature.wallet-service.guardian-fallback-name',
                                    { number: guardian.seat },
                                )}
                        </Text>
                        <Text
                            caption
                            color={
                                guardian.isResponding
                                    ? theme.colors.darkGrey
                                    : theme.colors.orange
                            }>
                            {guardian.isResponding
                                ? t('feature.wallet-service.guardian-online')
                                : t(
                                      'feature.wallet-service.guardian-not-responding',
                                  )}
                        </Text>
                    </Row>
                ))}
            </ScrollView>
        </ServiceSheet>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        list: {
            flexShrink: 1,
            width: '100%',
        },
        row: {
            paddingVertical: theme.spacing.sm,
        },
        dot: {
            borderRadius: 999,
            height: 7,
            width: 7,
        },
        name: {
            flex: 1,
        },
    })
