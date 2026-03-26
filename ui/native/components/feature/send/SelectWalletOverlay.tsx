import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import { useIsStabilityPoolEnabledByFederation } from '@fedi/common/hooks/federation'
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
                                {t('phrases.select-wallet')}
                            </Text>
                            <Column gap="lg">
                                {loadedFederations.map(f => (
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
}: {
    federation: LoadedFederation
    onDismiss: () => void
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
                <Column style={{ flexGrow: 1, flexShrink: 1 }}>
                    <Text numberOfLines={2} bold>
                        {federation.name}
                    </Text>
                    {recoveryInProgress && (
                        <Text caption color={theme.colors.darkGrey}>
                            {t('feature.federations.recovering-label')}
                        </Text>
                    )}
                </Column>
                {shouldShowInvite && (
                    <PressableIcon svgName="Qr" onPress={handlePressQr} />
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
    const { formattedBalance } = useBalance(t, federation.id)

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
                <Text style={{ flexGrow: 1 }}>{currencyCode}</Text>
                <Text>{formattedStableBalance}</Text>
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
            <Text style={{ flexGrow: 1 }}>{t('words.bitcoin')}</Text>
            <Text>{formattedBalance}</Text>
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
            maxHeight: 400,
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
    })
