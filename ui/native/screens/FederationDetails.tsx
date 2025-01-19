import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
    Linking,
    Pressable,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { selectAlphabeticallySortedFederations } from '@fedi/common/redux'
import { FederationListItem, Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import {
    getFederationMaxBalanceMsats,
    getFederationMaxInvoiceMsats,
    getFederationTosUrl,
    getFederationWelcomeMessage,
} from '@fedi/common/utils/FederationUtils'

import ConnectionStatusCard from '../components/feature/federations/ConnectionStatusCard'
import { FederationLogo } from '../components/feature/federations/FederationLogo'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'FederationDetails'
>

const FederationDetails: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const sortedFederations = useAppSelector(
        selectAlphabeticallySortedFederations,
    )

    const federation = sortedFederations.find(
        f => f.id === route.params.federationId,
    )

    const popupInfo = usePopupFederationInfo(federation?.meta)

    if (!federation) return null

    const welcomeMessage = getFederationWelcomeMessage(federation.meta)
    const tosUrl = getFederationTosUrl(federation.meta)
    const maxBalanceMsats = getFederationMaxBalanceMsats(federation?.meta)
    const maxInvoiceMsats = getFederationMaxInvoiceMsats(federation?.meta)

    const walletBalance: Sats = maxBalanceMsats
        ? ((maxBalanceMsats / 1000) as Sats)
        : (1_000_000_000 as Sats)

    const spendLimit: Sats = maxInvoiceMsats
        ? ((maxInvoiceMsats / 1000) as Sats)
        : (1_000_000_000 as Sats)

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop">
            <View style={style.content}>
                <FederationLogo federation={federation} size={72} />
                <View style={style.textContainer}>
                    <Text
                        h2
                        medium
                        maxFontSizeMultiplier={1.2}
                        style={style.title}>
                        {federation.name}
                    </Text>
                    {popupInfo && (
                        <PopupFederationPill federation={federation} />
                    )}
                    {welcomeMessage && (
                        <Text
                            medium
                            style={style.textStyle}
                            maxFontSizeMultiplier={1.2}>
                            {welcomeMessage}
                        </Text>
                    )}
                    <View style={style.balanceContainer}>
                        <Text
                            medium
                            style={style.textStyle}
                            maxFontSizeMultiplier={1.2}>
                            {t('phrases.wallet-balance', {
                                balance: amountUtils.formatSats(walletBalance),
                            })}
                        </Text>
                        <Text
                            medium
                            style={style.textStyle}
                            maxFontSizeMultiplier={1.2}>
                            {t('phrases.spend-limit', {
                                limit: amountUtils.formatSats(spendLimit),
                            })}
                        </Text>
                    </View>
                </View>
                <ConnectionStatusCard
                    status={federation.status}
                    hideArrow={true}
                />
            </View>
            {tosUrl && (
                <Pressable
                    onPress={() => Linking.openURL(tosUrl)}
                    style={style.tosLink}>
                    <Text
                        adjustsFontSizeToFit
                        style={style.textStyle}
                        numberOfLines={1}>
                        {t(
                            'feature.federations.federation-terms-and-conditions',
                        )}
                    </Text>
                </Pressable>
            )}
        </SafeAreaContainer>
    )
}

const PopupFederationPill = ({
    federation,
}: {
    federation: FederationListItem
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const popupInfo = usePopupFederationInfo(federation?.meta)

    const style = styles(theme)

    if (!popupInfo) return null

    const textStyle = popupInfo.endsSoon ? style.lightText : undefined

    const pillStyles: StyleProp<ViewStyle>[] = [style.pill]
    if (popupInfo.ended) {
        pillStyles.push(style.pillEnded)
    } else if (popupInfo.endsSoon) {
        pillStyles.push(style.pillEndsSoon)
    }

    const countdownI18nText =
        popupInfo.secondsLeft <= 0 ? (
            <Text caption bold>
                {t('feature.popup.ended')}
            </Text>
        ) : (
            <Text caption style={textStyle}>
                <Trans
                    t={t}
                    i18nKey="feature.popup.ending-in"
                    values={{ time: popupInfo.endsInText }}
                    components={{
                        bold: <Text caption bold style={textStyle} />,
                    }}
                />
            </Text>
        )

    return <View style={pillStyles}>{countdownI18nText}</View>
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.lg,
        },
        content: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
        },
        textContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.md,
        },
        balanceContainer: {
            alignItems: 'center',
        },
        title: {
            textAlign: 'center',
        },
        textStyle: {
            lineHeight: 20,
            textAlign: 'center',
        },
        pillEndsSoon: {
            backgroundColor: theme.colors.red,
            color: theme.colors.white,
        },
        pillEnded: {
            backgroundColor: theme.colors.lightGrey,
            color: theme.colors.primary,
        },
        pill: {
            paddingVertical: theme.spacing.xxs,
            paddingHorizontal: theme.spacing.sm,
            backgroundColor: '#BAE0FE',
            color: theme.colors.primary,
            borderRadius: 30,
        },
        lightText: {
            color: theme.colors.secondary,
        },
        tosLink: {
            padding: theme.spacing.xl,
        },
    })

export default FederationDetails
