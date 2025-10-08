import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { useTotalBalance } from '@fedi/common/hooks/amount'

import { Row } from './Flex'
import GradientView from './GradientView'
import SvgImage, { SvgImageSize } from './SvgImage'

const TotalBalance: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { shouldHideTotalBalance, formattedBalance, changeDisplayCurrency } =
        useTotalBalance()

    const style = styles(theme)

    const handlePress = () => {
        changeDisplayCurrency()
    }

    if (shouldHideTotalBalance) return null

    return (
        <Row align="center" justify="start" style={style.container}>
            <Pressable onPress={handlePress}>
                <GradientView variant="white" style={style.gradientContainer}>
                    <SvgImage name="Wallet" size={SvgImageSize.xs} />
                    <Text style={style.balanceText} caption medium>
                        {t('words.balance')}: {formattedBalance}
                    </Text>
                </GradientView>
            </Pressable>
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            width: '100%',
        },
        gradientContainer: {
            flexDirection: 'row',
            flex: 0,
            flexGrow: 0,
            gap: theme.spacing.xs,
            alignSelf: 'flex-start',
            width: 'auto',
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.sm,
            backgroundColor: theme.colors.secondary,
            borderWidth: 1.5,
            borderColor: theme.colors.lightGrey,
            borderRadius: theme.sizes.bubbleButtonSize * 2,
        },
        balanceText: {
            color: theme.colors.primary,
            textAlign: 'center',
        },
    })

export default TotalBalance
