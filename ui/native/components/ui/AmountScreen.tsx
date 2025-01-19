import { Button, ButtonProps, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, useWindowDimensions } from 'react-native'

import { useBalanceDisplay } from '@fedi/common/hooks/amount'
import { selectActiveFederation } from '@fedi/common/redux'
import { hexToRgba } from '@fedi/common/utils/color'

import { useAppSelector } from '../../state/hooks'
import AmountInput, { Props as AmountInputProps } from './AmountInput'
import KeyboardAwareWrapper from './KeyboardAwareWrapper'
import { SafeAreaContainer } from './SafeArea'

interface Props extends AmountInputProps {
    showBalance?: boolean
    subHeader?: React.ReactNode | null
    subContent?: React.ReactNode | null
    description?: string
    buttons?: ButtonProps[]
    // Whether AmountScreen is independently being used as a screen. Defaults to true.
    isIndependent?: boolean
}

export const AmountScreen: React.FC<Props> = ({
    showBalance,
    subHeader = null,
    subContent = null,
    buttons = [],
    isIndependent = true,
    ...amountInputProps
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { height } = useWindowDimensions()
    const activeFederation = useAppSelector(selectActiveFederation)
    const balance = activeFederation?.hasWallet
        ? activeFederation.balance
        : undefined
    const balanceDisplay = useBalanceDisplay(t)

    const style = styles(theme, height)

    return (
        <KeyboardAwareWrapper>
            <SafeAreaContainer
                style={style.container}
                edges={isIndependent ? 'notop' : 'none'}
                padding="xl">
                <View style={style.subHeader}>
                    {subHeader}
                    {showBalance && typeof balance === 'number' && (
                        <Text
                            caption
                            style={style.balance}
                            numberOfLines={1}
                            adjustsFontSizeToFit>
                            {`${balanceDisplay} `}
                        </Text>
                    )}
                </View>
                <AmountInput {...amountInputProps} />
                {subContent && <View>{subContent}</View>}
                <View style={style.buttonGroup}>
                    {buttons.map((button, index) => (
                        <Button
                            key={`btn-${index}`}
                            containerStyle={[
                                style.buttonContainer,
                                button.containerStyle,
                            ]}
                            {...button}
                        />
                    ))}
                </View>
            </SafeAreaContainer>
        </KeyboardAwareWrapper>
    )
}

const styles = (theme: Theme, height: number) =>
    StyleSheet.create({
        container: {
            width: '100%',
            gap: theme.spacing.xl,
        },
        subHeader: {
            paddingTop: height >= 500 ? theme.spacing.xl : theme.spacing.sm,
        },
        balance: {
            color: hexToRgba(theme.colors.primary, 0.6),
            textAlign: 'center',
        },
        buttonGroup: {
            width: '100%',
            alignSelf: 'center',
            flexDirection: 'row',
            gap: 20,
        },
        buttonContainer: {
            flex: 1,
        },
    })
