import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import toUpper from 'lodash/toUpper'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Pressable } from 'react-native-gesture-handler'
import { LinearGradientProps } from 'react-native-linear-gradient'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { selectCurrency } from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { useAppSelector } from '../../../state/hooks'
import { BubbleCard } from '../../ui/BubbleView'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const StabilityWalletPlaceholder: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation()
    const stylesPlaceholder = styles(theme)

    const selectedCurrency = useAppSelector(selectCurrency)

    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const zeroMsats = 0 as MSats
    const { formattedPrimaryAmount } = makeFormattedAmountsFromMSats(zeroMsats)

    const gradientProps: LinearGradientProps = {
        colors: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.0)'],
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
    }

    return (
        <Pressable onPress={() => navigation.navigate('PublicFederations')}>
            <BubbleCard
                linearGradientProps={gradientProps}
                containerStyle={[stylesPlaceholder.card, { height: 100 }]}>
                <View style={stylesPlaceholder.headerContainer}>
                    <View style={stylesPlaceholder.leftGroup}>
                        <View style={stylesPlaceholder.titleContainer}>
                            <SvgImage
                                name="UsdCircle"
                                size={SvgImageSize.md}
                                color={theme.colors.white}
                            />
                            <Text
                                allowFontScaling={false}
                                bold
                                style={stylesPlaceholder.title}>
                                {`${toUpper(selectedCurrency)} ${t(
                                    'feature.stabilitypool.stable-balance',
                                )}`}
                            </Text>
                        </View>
                        <SvgImage
                            name="ChevronRightSmall"
                            color={theme.colors.secondary}
                            dimensions={{ width: 6, height: 12 }}
                        />
                    </View>
                    {/* Balance on the right */}
                    <View style={stylesPlaceholder.balanceContainer}>
                        <Text
                            allowFontScaling={false}
                            style={stylesPlaceholder.balanceTextMain}>
                            {amountUtils.stripTrailingZerosWithSuffix(
                                formattedPrimaryAmount,
                            )}
                        </Text>
                    </View>
                </View>
                <View style={stylesPlaceholder.buttonsContainer}>
                    <Text
                        allowFontScaling={false}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={stylesPlaceholder.buttonLabel}>
                        {t('feature.wallet.join-federation')}
                    </Text>
                </View>
            </BubbleCard>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.colors.mint,
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
        title: {
            color: theme.colors.secondary,
            fontSize: 16,
        },
        balanceContainer: {
            alignItems: 'flex-end',
        },
        balanceTextMain: {
            color: theme.colors.white,
            fontSize: 18,
            fontWeight: 'bold',
        },
        svgStyle: {
            /* no longer used after row alignment */
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

export default StabilityWalletPlaceholder
