import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { Pressable } from 'react-native-gesture-handler'
import { LinearGradientProps } from 'react-native-linear-gradient'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { MSats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { BubbleCard } from '../../ui/BubbleView'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const BitcoinWalletPlaceholder: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const stylesPlaceholder = styles(theme)
    const navigation = useNavigation()

    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    // convert 0 sats → 0 msats (MSats)
    const zeroMsats = 0 as MSats
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(zeroMsats)

    const gradientProps: LinearGradientProps = {
        colors: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.0)'],
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
    }

    return (
        <Pressable onPress={() => navigation.navigate('PublicFederations')}>
            <BubbleCard
                linearGradientProps={gradientProps}
                containerStyle={[stylesPlaceholder.card, { height: 99 }]}>
                <Flex style={stylesPlaceholder.headerContainer}>
                    <Flex style={stylesPlaceholder.leftGroup}>
                        <Flex style={stylesPlaceholder.titleContainer}>
                            <SvgImage
                                name="BitcoinCircle"
                                size={SvgImageSize.md}
                                color={theme.colors.white}
                            />
                            <Flex>
                                <Flex style={stylesPlaceholder.row}>
                                    <Text
                                        allowFontScaling={false}
                                        bold
                                        style={stylesPlaceholder.title}>
                                        {t('words.bitcoin')}
                                    </Text>
                                </Flex>
                            </Flex>
                        </Flex>
                        <SvgImage
                            name="ChevronRightSmall"
                            color={theme.colors.secondary}
                            dimensions={{ width: 6, height: 12 }}
                        />
                    </Flex>
                    <Flex style={stylesPlaceholder.balanceContainer}>
                        <Text
                            allowFontScaling={false}
                            medium
                            style={stylesPlaceholder.balanceTextMain}>
                            {amountUtils.stripTrailingZerosWithSuffix(
                                formattedPrimaryAmount,
                            )}
                        </Text>
                        <Text
                            allowFontScaling={false}
                            small
                            style={stylesPlaceholder.balanceTextSats}>
                            {formattedSecondaryAmount}
                        </Text>
                    </Flex>
                </Flex>
                <Flex style={stylesPlaceholder.buttonsContainer}>
                    <Text
                        allowFontScaling={false}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={stylesPlaceholder.buttonLabel}>
                        {t('feature.wallet.join-federation')}
                    </Text>
                </Flex>
            </BubbleCard>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.colors.orange,
            height: 99,
        },
        headerContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: theme.spacing.lg,
        },
        leftGroup: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        titleContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        title: {
            color: theme.colors.secondary,
            fontSize: 16,
        },
        subtitle: {
            color: theme.colors.secondary,
            fontSize: 12,
        },
        balanceContainer: {
            alignItems: 'flex-end',
        },
        balanceTextMain: {
            color: theme.colors.white,
            fontSize: 18,
            fontWeight: 'bold',
        },
        balanceTextSats: {
            color: theme.colors.white,
            fontSize: 12,
        },
        buttonsContainer: {
            top: -20,
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: theme.spacing.lg,
        },
        buttonLabel: {
            textAlign: 'center',
            color: theme.colors.white,
            padding: theme.spacing.sm,
            fontSize: 14,
            fontWeight: '500',
            left: -6,
        },
    })

export default BitcoinWalletPlaceholder
