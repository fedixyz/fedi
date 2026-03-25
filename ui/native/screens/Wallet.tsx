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
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectCurrency,
    selectFederationBalance,
    selectIsFederationRecovering,
    selectIsInternetUnreachable,
    setSelectedFederationId,
    selectLoadedFederations,
    selectMaxStableBalanceSats,
    selectPaymentType,
    selectReceivesDisabled,
    selectSelectedFederation,
    selectShouldShowStablePaymentAddress,
    selectStabilityPoolVersion,
    selectStableBalancePending,
    selectStableBalanceSats,
    setPaymentType,
} from '@fedi/common/redux'
import { getCurrencyCode } from '@fedi/common/utils/currency'

import WalletBalanceCard from '../components/feature/federations/BalanceCard'
import FederationStatusAvatar from '../components/feature/federations/FederationStatusAvatar'
import { Column, Row } from '../components/ui/Flex'
import HoloLoader from '../components/ui/HoloLoader'
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
    const recoveryInProgress = useAppSelector(s =>
        selectIsFederationRecovering(s, federationId),
    )
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federationId),
    )
    const receivesDisabled = useAppSelector(s =>
        selectReceivesDisabled(s, federationId),
    )
    const shouldShowStablePaymentAddress = useAppSelector(s =>
        selectShouldShowStablePaymentAddress(s, federationId),
    )
    const stableBalanceSats = useAppSelector(s =>
        selectStableBalanceSats(s, federationId),
    )
    const stableBalancePending = useAppSelector(s =>
        selectStableBalancePending(s, federationId),
    )
    const maxStableBalanceSats = useAppSelector(s =>
        selectMaxStableBalanceSats(s, federationId),
    )
    const isLegacyStabilityPool = useAppSelector(
        s => selectStabilityPoolVersion(s, federationId) === 1,
    )
    const isOffline = useAppSelector(selectIsInternetUnreachable)
    const balance = useAppSelector(s =>
        selectFederationBalance(s, federationId),
    )

    const { progress, formattedPercent } = useRecoveryProgress(federationId)
    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})
    const stabilityPoolDisabledByFederation =
        !useIsStabilityPoolEnabledByFederation(federationId)

    const dispatch = useAppDispatch()
    const toast = useToast()

    useMonitorStabilityPool(federationId)

    const handleReceive = () => {
        if (receivesDisabled) {
            toast.show({
                content: t('errors.receives-have-been-disabled'),
                status: 'error',
            })
        } else {
            navigation.navigate('ReceiveBitcoin', { federationId })
        }
    }

    const handleSend = () => {
        if (isOffline) {
            navigation.navigate('SendOfflineAmount')
        } else {
            navigation.navigate('Send', { federationId })
        }
    }

    const handleMove = () => {
        if (stabilityPoolDisabledByFederation) {
            toast.show({
                content: t(
                    'feature.stabilitypool.deposits-disabled-by-federation',
                ),
                status: 'error',
            })
        } else if (
            maxStableBalanceSats &&
            stableBalanceSats > maxStableBalanceSats
        ) {
            toast.show({
                content: t('feature.stabilitypool.max-stable-balance-amount'),
                status: 'error',
            })
        } else if (stableBalancePending < 0) {
            toast.show({
                content: t('feature.stabilitypool.pending-withdrawal-blocking'),
                status: 'error',
            })
        } else {
            navigation.navigate('StabilityMove', {
                federationId,
            })
        }
    }

    const handleTransfer = () => {
        if (stableBalancePending < 0) {
            toast.show({
                content: t('feature.stabilitypool.pending-withdrawal-blocking'),
                status: 'error',
            })
        } else if (shouldShowStablePaymentAddress) {
            // use new transfer flow is feature flag is on
            navigation.navigate('StabilityTransfer', {
                federationId,
            })
        } else {
            navigation.navigate('StabilityTransfer', {
                federationId,
            })
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
                    fullWidth>
                    {t('phrases.join-a-federation')}
                </Button>
            </Column>
        )
    }

    if (!federation) return null

    if (recoveryInProgress) {
        return (
            <Column style={style.container}>
                <SelectedWalletHeader federation={federation} />
                <Column center gap="md" grow>
                    <Text h2 center>
                        {t('phrases.recovery-in-progress')}
                    </Text>
                    <Text caption center>
                        {t('feature.recovery.recovery-in-progress-wallet')}
                    </Text>
                    <HoloLoader progress={progress} label={formattedPercent} />
                </Column>
            </Column>
        )
    }

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
                    {paymentType === 'bitcoin' ? (
                        <>
                            <Button
                                title={t('words.receive')}
                                icon={
                                    <SvgImage
                                        name="ArrowDown"
                                        color={theme.colors.white}
                                    />
                                }
                                containerStyle={{
                                    flex: 1,
                                }}
                                onPress={handleReceive}
                                disabled={popupInfo?.ended || receivesDisabled}
                            />
                            <Button
                                title={t('words.send')}
                                icon={
                                    <SvgImage
                                        name="ArrowUp"
                                        color={theme.colors.white}
                                    />
                                }
                                containerStyle={{
                                    flex: 1,
                                }}
                                onPress={handleSend}
                                disabled={
                                    popupInfo?.ended ||
                                    federation.balance < 1000
                                }
                            />
                        </>
                    ) : (
                        // TODO: change to receive/send after stability pool send/receive screns are updated
                        <>
                            <Button
                                title={t('words.move')}
                                icon={
                                    <SvgImage
                                        name="ArrowsUpDown"
                                        color={theme.colors.white}
                                    />
                                }
                                containerStyle={{
                                    flex: 1,
                                }}
                                onPress={handleMove}
                                disabled={
                                    popupInfo?.ended ||
                                    (shouldShowStablePaymentAddress
                                        ? false
                                        : balance === 0)
                                }
                            />
                            <Button
                                title={t('words.transfer')}
                                icon={
                                    <SvgImage
                                        name="TransferPeople"
                                        color={theme.colors.white}
                                    />
                                }
                                containerStyle={{
                                    flex: 1,
                                }}
                                onPress={handleTransfer}
                                disabled={
                                    popupInfo?.ended || isLegacyStabilityPool
                                }
                            />
                        </>
                    )}
                </Row>
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
    })

export default Wallet
