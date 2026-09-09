import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import { useIsStabilityPoolEnabledByFederation } from '@fedi/common/hooks/federation'
import { useWalletServiceFederationId } from '@fedi/common/hooks/fi'
import { useRecoveryProgress } from '@fedi/common/hooks/recovery'
import {
    selectCurrency,
    selectLoadedFederationsByRecency,
    selectShouldShowInviteCode,
    setPaymentType,
    setSelectedFederationId,
} from '@fedi/common/redux'
import { getCurrencyCode } from '@fedi/common/utils/currency'

import {
    useAppDispatch,
    useAppSelector,
    useStabilityPool,
} from '../../../state/hooks'
import { LoadedFederation } from '../../../types'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import { PressableIcon } from '../../ui/PressableIcon'
import SvgImage from '../../ui/SvgImage'
import FederationStatusAvatar from '../federations/FederationStatusAvatar'

export default function SelectWalletOverlay({
    open,
    onDismiss,
}: {
    open: boolean
    onDismiss: (paymentType?: 'bitcoin' | 'stable-balance') => void
}) {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const loadedFederations = useAppSelector(selectLoadedFederationsByRecency)
    // resolved once here, not per row: the id comes from an async invite-code
    // parse, and a row-level call would run it once per federation
    const walletServiceFederationId = useWalletServiceFederationId()
    const ownWalletService = loadedFederations.find(
        f => f.id === walletServiceFederationId,
    )
    const otherFederations = ownWalletService
        ? loadedFederations.filter(f => f.id !== ownWalletService.id)
        : loadedFederations
    const style = styles(theme)

    return (
        <CustomOverlay
            show={open}
            onBackdropPress={onDismiss}
            contents={{
                body: (
                    <ScrollView
                        style={style.scrollContainer}
                        showsVerticalScrollIndicator={false}>
                        <Column gap="lg" style={style.body}>
                            <Text h2 medium>
                                {t('phrases.select-wallet-service')}
                            </Text>
                            {ownWalletService && (
                                <Column gap="md">
                                    <Text caption color={theme.colors.darkGrey}>
                                        {t(
                                            'feature.wallet-service.list-your-wallet-service',
                                        )}
                                    </Text>
                                    <WalletListItem
                                        federation={ownWalletService}
                                        onDismiss={onDismiss}
                                        isFounder
                                    />
                                    {otherFederations.length > 0 && (
                                        <Text
                                            caption
                                            color={theme.colors.darkGrey}>
                                            {t(
                                                'feature.wallet-service.list-other-wallet-service',
                                            )}
                                        </Text>
                                    )}
                                </Column>
                            )}
                            <Column gap="lg">
                                {otherFederations.map(f => (
                                    <WalletListItem
                                        key={`wallet-list-item-${f.id}`}
                                        federation={f}
                                        onDismiss={onDismiss}
                                    />
                                ))}
                            </Column>
                        </Column>
                    </ScrollView>
                ),
            }}
        />
    )
}

function WalletListItem({
    federation,
    onDismiss,
    isFounder = false,
}: {
    federation: LoadedFederation
    onDismiss: () => void
    isFounder?: boolean
}) {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation()
    const dispatch = useAppDispatch()
    const style = styles(theme)
    const supportsStabilityPool = useIsStabilityPoolEnabledByFederation(
        federation.id,
    )
    const { recoveryInProgress } = useRecoveryProgress(federation.id)
    const shouldShowInvite = useAppSelector(s =>
        selectShouldShowInviteCode(s, federation.id),
    )

    const handlePressQr = () => {
        navigation.navigate('FederationInvite', {
            inviteLink: federation.inviteCode,
        })
        onDismiss()
    }

    const handlePressSettings = () => {
        navigation.navigate('WalletServiceSettings')
        onDismiss()
    }

    const handleSelectBitcoin = () => {
        dispatch(setSelectedFederationId(federation.id))
        dispatch(setPaymentType('bitcoin'))
        onDismiss()
    }

    const handleSelectStableBalance = () => {
        dispatch(setSelectedFederationId(federation.id))
        dispatch(setPaymentType('stable-balance'))
        onDismiss()
    }

    return (
        <Column gap="sm" testID={`SelectWalletListItem-${federation.id}`}>
            <Pressable
                onPress={handleSelectBitcoin}
                containerStyle={style.walletHeader}>
                <FederationStatusAvatar federation={federation} size={40} />
                <Column style={style.label}>
                    <View style={style.nameRow}>
                        <Text numberOfLines={2} bold style={style.name}>
                            {federation.name}
                        </Text>
                        {isFounder && (
                            <View
                                style={style.chip}
                                testID={`FounderChip-${federation.id}`}>
                                <Text small medium>
                                    {t('feature.wallet-service.founder')}
                                </Text>
                            </View>
                        )}
                    </View>
                    {recoveryInProgress && (
                        <Text caption color={theme.colors.darkGrey}>
                            {t('feature.federations.recovering-label')}
                        </Text>
                    )}
                </Column>
                {shouldShowInvite && (
                    <PressableIcon svgName="Qr" onPress={handlePressQr} />
                )}
                {isFounder && (
                    <PressableIcon
                        svgName="Cog"
                        onPress={handlePressSettings}
                        testID={`WalletServiceSettingsButton-${federation.id}`}
                    />
                )}
            </Pressable>
            {!recoveryInProgress && (
                <>
                    <BalanceItem
                        type="bitcoin"
                        federation={federation}
                        onPress={handleSelectBitcoin}
                    />
                    {supportsStabilityPool && (
                        <BalanceItem
                            type="stable-balance"
                            federation={federation}
                            onPress={handleSelectStableBalance}
                        />
                    )}
                </>
            )}
        </Column>
    )
}

function BalanceItem({
    type,
    federation,
    onPress,
}: {
    type: 'bitcoin' | 'stable-balance'
    federation: LoadedFederation
    onPress: () => void
}) {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federation.id),
    )
    const { formattedStableBalance } = useStabilityPool(federation.id)
    const { formattedBalanceFiat, formattedBalanceSats } = useBalance(
        t,
        federation.id,
    )

    const currencyCode = getCurrencyCode(selectedCurrency)
    const style = styles(theme)

    if (type === 'stable-balance') {
        return (
            <Pressable
                containerStyle={style.balanceItem}
                onPress={onPress}
                testID={`StableBalanceButton-${federation.id}`}>
                <SvgImage
                    name="UsdCircleFilled"
                    color={theme.colors.moneyGreen}
                />
                <Text style={style.label} numberOfLines={1}>
                    {currencyCode}
                </Text>
                <Text style={style.balanceText} numberOfLines={1}>
                    {formattedStableBalance}
                </Text>
                <SvgImage
                    name="ChevronRight"
                    color={theme.colors.darkGrey}
                    size={16}
                />
            </Pressable>
        )
    }

    return (
        <Pressable
            containerStyle={style.balanceItem}
            onPress={onPress}
            testID={`BitcoinButton-${federation.id}`}>
            <SvgImage name="BitcoinCircle" color={theme.colors.orange} />
            <Text style={style.label} numberOfLines={1}>
                {t('words.bitcoin')}
            </Text>
            <Column style={style.balanceColumn}>
                <Text numberOfLines={1}>{formattedBalanceFiat}</Text>
                <Text numberOfLines={1} caption color={theme.colors.darkGrey}>
                    {formattedBalanceSats}
                </Text>
            </Column>
            <SvgImage
                name="ChevronRight"
                color={theme.colors.darkGrey}
                size={16}
            />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        scrollContainer: {
            maxHeight: 560,
        },
        balanceItem: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: theme.spacing.lg,
            gap: theme.spacing.sm,
            width: '100%',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
        },
        walletHeader: {
            alignContent: 'center',
            gap: theme.spacing.md,
        },
        body: {
            padding: theme.spacing.sm,
        },
        label: {
            flexGrow: 1,
            flexShrink: 1,
        },
        nameRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
        },
        name: {
            flexShrink: 1,
        },
        chip: {
            backgroundColor: theme.colors.extraLightGrey,
            borderRadius: 6,
            paddingVertical: 2,
            paddingHorizontal: theme.spacing.xs,
        },
        balanceText: {
            flexShrink: 1,
        },
        balanceColumn: {
            flexShrink: 1,
            alignItems: 'flex-end',
        },
    })
