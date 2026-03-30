import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { Button, Text, Tooltip, useTheme, type Theme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'

import {
    useIsStabilityPoolEnabledByFederation,
    usePopupFederationInfo,
} from '@fedi/common/hooks/federation'
import { useRecoveryProgress } from '@fedi/common/hooks/recovery'
import { useMonitorStabilityPool } from '@fedi/common/hooks/stabilitypool'
import {
    selectCurrency,
    selectIsInternetUnreachable,
    setSelectedFederationId,
    selectLoadedFederations,
    selectPaymentType,
    selectReceivesDisabled,
    selectSelectedFederation,
    selectStableBalancePending,
    setPaymentType,
    setPayFromFederationId,
} from '@fedi/common/redux'
import { getCurrencyCode } from '@fedi/common/utils/currency'

import WalletBalanceCard from '../components/feature/federations/BalanceCard'
import FederationStatusAvatar from '../components/feature/federations/FederationStatusAvatar'
import { Column, Row } from '../components/ui/Flex'
import { Pressable } from '../components/ui/Pressable'
import { PressableIcon } from '../components/ui/PressableIcon'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { Switcher } from '../components/ui/Switcher'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetToJoinFederation } from '../state/navigation'
import { LoadedFederation } from '../types'
import type {
    RootStackParamList,
    TabsNavigatorParamList,
} from '../types/navigation'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'Wallet'
>

const Wallet: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const federation = useAppSelector(selectSelectedFederation)
    const federationId = federation?.id ?? ''
    const paymentType = useAppSelector(selectPaymentType)
    const loadedFederations = useAppSelector(selectLoadedFederations)
    const { recoveryInProgress } = useRecoveryProgress(federationId)
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federationId),
    )
    const receivesDisabled = useAppSelector(s =>
        selectReceivesDisabled(s, federationId),
    )
    const stableBalancePending = useAppSelector(s =>
        selectStableBalancePending(s, federationId),
    )
    const isOffline = useAppSelector(selectIsInternetUnreachable)

    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})
    const stabilityPoolDisabledByFederation =
        !useIsStabilityPoolEnabledByFederation(federationId)

    const dispatch = useAppDispatch()

    const handleReceive = () => {
        if (paymentType === 'stable-balance') {
            navigation.navigate('StabilityReceive', { federationId })
        } else {
            navigation.navigate('ReceiveBitcoin', { federationId })
        }
    }

    const handleSend = () => {
        dispatch(setPayFromFederationId(federationId))
        if (paymentType === 'stable-balance') {
            navigation.navigate('StabilitySend', { federationId })
        } else if (isOffline) {
            navigation.navigate('SendOfflineAmount')
        } else {
            navigation.navigate('Send', { federationId })
        }
    }

    const currencyCode = getCurrencyCode(selectedCurrency)
    const style = styles(theme)

    useEffect(() => {
        if (loadedFederations.length > 0 && !federation)
            dispatch(setSelectedFederationId(loadedFederations[0].id))
    }, [federation, loadedFederations, dispatch])

    // If the current federation doesn't support stability pool, switch to bitcoin
    useEffect(() => {
        if (stabilityPoolDisabledByFederation) {
            dispatch(setPaymentType('bitcoin'))
        }
    }, [dispatch, stabilityPoolDisabledByFederation])

    useMonitorStabilityPool(federationId)

    if (loadedFederations.length === 0) {
        return (
            <Column grow center style={style.empty} gap="md">
                <Column
                    align="center"
                    gap="md"
                    fullWidth
                    style={style.emptyContainer}>
                    <Text bold>{t('feature.federations.no-federations')}</Text>
                    <Text caption>{t('feature.wallet.join-federation')}</Text>
                </Column>
                <Button
                    onPress={() => navigation.dispatch(resetToJoinFederation())}
                    fullWidth
                    testID="JoinAFederationButton">
                    {t('phrases.join-a-federation')}
                </Button>
            </Column>
        )
    }

    if (!federation) return null

    const stableBalanceBlocked =
        paymentType === 'stable-balance' && stableBalancePending < 0
    const shouldDisableReceives =
        popupInfo?.ended ||
        receivesDisabled ||
        recoveryInProgress ||
        stableBalanceBlocked
    const shouldDisableSends =
        popupInfo?.ended ||
        recoveryInProgress ||
        (paymentType === 'bitcoin'
            ? federation.balance < 1000
            : stableBalanceBlocked)

    const disabledMessage = recoveryInProgress
        ? t('feature.recovery.recovery-in-progress-wallet')
        : stableBalanceBlocked
          ? t('feature.stabilitypool.pending-withdrawal-blocking')
          : receivesDisabled
            ? t('errors.receives-have-been-disabled')
            : null

    return (
        <ScrollView
            contentContainerStyle={style.container}
            style={style.scrollContainer}
            alwaysBounceVertical={false}>
            <Column gap="lg" fullWidth grow>
                <SelectedWalletHeader federation={federation} />
                {stabilityPoolDisabledByFederation ? null : (
                    <Switcher<'bitcoin' | 'stable-balance'>
                        options={[
                            {
                                label: t('words.bitcoin'),
                                value: 'bitcoin',
                            },
                            {
                                label: currencyCode,
                                value: 'stable-balance',
                            },
                        ]}
                        onChange={type => dispatch(setPaymentType(type))}
                        selected={paymentType}
                    />
                )}
                <WalletBalanceCard federationId={federationId} />
                <Row fullWidth gap="md" justify="between">
                    <Button
                        title={t('words.receive')}
                        icon={
                            <SvgImage
                                name="ArrowDown"
                                color={
                                    shouldDisableReceives
                                        ? theme.colors.lightGrey
                                        : theme.colors.white
                                }
                            />
                        }
                        containerStyle={{
                            flex: 1,
                        }}
                        onPress={handleReceive}
                        disabled={shouldDisableReceives}
                    />
                    <Button
                        title={t('words.send')}
                        icon={
                            <SvgImage
                                name="ArrowUp"
                                color={
                                    shouldDisableSends
                                        ? theme.colors.lightGrey
                                        : theme.colors.white
                                }
                            />
                        }
                        containerStyle={{
                            flex: 1,
                        }}
                        onPress={handleSend}
                        disabled={shouldDisableSends}
                    />
                </Row>
                {disabledMessage && (
                    <Text
                        center
                        caption
                        color={theme.colors.darkGrey}
                        style={style.disabledText}>
                        {disabledMessage}
                    </Text>
                )}
            </Column>
        </ScrollView>
    )
}

function SelectedWalletHeader({
    federation,
}: {
    federation: LoadedFederation
}) {
    const [tooltipOpen, setTooltipOpen] = useState(false)

    const navigation = useNavigation()
    const { t } = useTranslation()
    const { theme } = useTheme()

    const goToFederationDetails = () => {
        navigation.navigate('FederationDetails', {
            federationId: federation.id,
        })
    }

    const style = styles(theme)

    return (
        <Pressable
            containerStyle={style.paymentFederationHeader}
            onPress={goToFederationDetails}
            testID={federation.name.concat('DetailsButton').replaceAll(' ', '')}
            // hitSlop is intentionally set to 9 to expand the hit area
            // but not cause accidental tab presses
            hitSlop={8}>
            <FederationStatusAvatar federation={federation} size={48} />
            <Text medium h2 style={style.title}>
                {federation.name}
            </Text>
            <Tooltip
                visible={tooltipOpen}
                onClose={() => setTooltipOpen(false)}
                onOpen={() => setTooltipOpen(true)}
                closeOnlyOnBackdropPress
                withOverlay
                overlayColor={theme.colors.overlay}
                width={200}
                height={75}
                backgroundColor={theme.colors.blue100}
                popover={
                    <Text caption>
                        {t('feature.wallet.wallet-provider-guidance')}
                    </Text>
                }>
                <PressableIcon
                    svgName="Help"
                    onPress={e => {
                        e.stopPropagation()
                        setTooltipOpen(true)
                    }}
                    hitSlop={8}
                    svgProps={{ color: theme.colors.grey }}
                />
            </Tooltip>
            <SvgImage
                name="ChevronRight"
                color={theme.colors.darkGrey}
                containerStyle={style.icon}
                size={SvgImageSize.sm}
            />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        container: {
            padding: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
            width: '100%',
            flexGrow: 1,
        },
        paymentFederationHeader: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingVertical: 0,
        },
        empty: {
            paddingHorizontal: theme.spacing.lg,
        },
        emptyContainer: {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderColor: theme.colors.lightGrey,
            borderRadius: 16,
            borderWidth: 1,
            borderStyle: 'dashed',
        },
        icon: {
            marginLeft: 'auto',
        },
        title: {
            color: theme.colors.primary,
            flexShrink: 1,
            flexGrow: 1,
        },
        disabledText: {
            paddingBottom: theme.spacing.md,
        },
    })

export default Wallet
