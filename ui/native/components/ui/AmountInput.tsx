import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
    Keyboard,
    Pressable,
    StyleProp,
    StyleSheet,
    TextInput,
    TextStyle,
    View,
    useWindowDimensions,
} from 'react-native'

import { useAmountInput } from '@fedi/common/hooks/amount'
import { Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import InvisibleInput from './InvisibleInput'
import { NumpadButton } from './NumpadButton'
import SvgImage from './SvgImage'

const log = makeLog('native/components/ui/AmountInput')

export type Props = {
    amount: Sats
    switcherEnabled?: boolean
    lockToFiat?: boolean
    readOnly?: boolean
    minimumAmount?: Sats | null
    maximumAmount?: Sats | null
    submitAttempts?: number
    isSubmitting?: boolean
    verb?: string
    onChangeAmount?: (amount: Sats) => void
}

const AmountInput: React.FC<Props> = ({
    amount,
    readOnly,
    switcherEnabled = true,
    lockToFiat = false,
    minimumAmount,
    maximumAmount,
    submitAttempts,
    isSubmitting,
    verb,
    onChangeAmount,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const {
        isFiat,
        setIsFiat,
        satsValue,
        fiatValue,
        handleChangeSats,
        handleChangeFiat,
        currency,
        validation,
        numpadButtons,
        handleNumpadPress,
        currencyLocale,
    } = useAmountInput(amount, onChangeAmount, minimumAmount, maximumAmount)
    const inputRef = useRef<TextInput>(null)
    const { height, width } = useWindowDimensions()

    const style = styles(theme, width)

    useEffect(() => {
        if (lockToFiat) setIsFiat(true)
    }, [lockToFiat, setIsFiat])

    // For some reason the TextInput inside InvisibleInput does not
    // automatically blur the input when the keyboard is dismissed
    // which causes the .focus() event to have no effect so here we
    // force the blur to make sure .isFocused() returns false
    useEffect(() => {
        const keyboardHiddenListener = Keyboard.addListener(
            'keyboardDidHide',
            () => inputRef.current?.blur(),
        )
        return () => {
            keyboardHiddenListener.remove()
        }
    }, [])

    // Check validation for errors to render with suggestion for amount.
    let error: React.ReactNode | undefined
    if (
        validation &&
        !isSubmitting &&
        (!validation.onlyShowOnSubmit || submitAttempts)
    ) {
        const handlePressSuggestion = () => {
            handleChangeSats(validation.amount.toString())
        }
        const suggestionStyle: StyleProp<TextStyle> = [style.errorSuggestion]
        if (!readOnly) {
            suggestionStyle.push(style.clickableSuggestion)
        }
        // TODO: Make only underlined suggestion pressable, <Trans /> doesn't like <Pressable /> as a component
        // TODO: Make this wiggle when submitAttempts is incremented
        error = (
            <Pressable onPress={handlePressSuggestion} disabled={readOnly}>
                <Text style={style.error} caption>
                    <Trans
                        i18nKey={validation.i18nKey}
                        values={{
                            verb:
                                verb?.toLowerCase() ||
                                t('words.send').toLowerCase(),
                            amount: lockToFiat
                                ? amountUtils.formatFiat(
                                      validation.fiatValue,
                                      currency,
                                      {
                                          symbolPosition: 'end',
                                          locale: currencyLocale,
                                      },
                                  )
                                : `${amountUtils.formatSats(
                                      validation.amount,
                                  )} ${t('words.sats')}`,
                        }}
                        components={{
                            suggestion: (
                                <Text style={suggestionStyle} caption />
                            ),
                        }}
                    />
                </Text>
            </Pressable>
        )
    }

    const hasNumpad = height >= 500 && !readOnly
    const secondaryAmountText = isFiat
        ? `${satsValue} ${t('words.sats').toUpperCase()}`
        : `${fiatValue} ${currency}`

    return (
        <View style={style.container}>
            <View style={style.amounts}>
                <Pressable
                    style={style.primaryAmount}
                    disabled={readOnly || hasNumpad || isSubmitting}
                    onPress={() => inputRef?.current?.focus()}>
                    <InvisibleInput
                        inputRef={inputRef}
                        value={isFiat ? fiatValue : satsValue}
                        label={
                            isFiat ? currency : t('words.sats').toUpperCase()
                        }
                        onChangeText={
                            isFiat ? handleChangeFiat : handleChangeSats
                        }
                        readOnly={readOnly || hasNumpad || isSubmitting}
                    />
                </Pressable>
                {switcherEnabled && (
                    <Pressable
                        style={style.symbolSwitcher}
                        disabled={readOnly || isSubmitting}
                        onPress={() => setIsFiat(!isFiat)}>
                        <Text
                            style={style.secondaryAmountText}
                            medium
                            numberOfLines={1}>
                            {secondaryAmountText}
                        </Text>
                        {!readOnly && (
                            <SvgImage
                                name="Switch"
                                color={theme.colors.grey}
                                size={20}
                            />
                        )}
                    </Pressable>
                )}
                {error}
            </View>
            {hasNumpad && (
                <View style={style.numpad}>
                    {numpadButtons.map(btn => (
                        <NumpadButton
                            key={btn}
                            btn={btn}
                            onPress={() => {
                                try {
                                    handleNumpadPress(btn)
                                } catch (err) {
                                    log.error('handleNumpadPress', err)
                                }
                            }}
                            disabled={isSubmitting}
                        />
                    ))}
                </View>
            )}
        </View>
    )
}

const styles = (theme: Theme, width: number) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
            alignItems: 'center',
            gap: theme.spacing.lg,
        },
        amounts: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.md,
        },
        primaryAmount: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            marginHorizontal: theme.spacing.lg,
            width: '100%',
        },
        primaryLabelText: {
            marginLeft: theme.spacing.sm,
            marginBottom: 3,
            fontSize: 20,
        },
        secondaryAmountText: {
            color: theme.colors.darkGrey,
            textAlign: 'center',
            marginRight: theme.spacing.xs,
        },
        symbolSwitcher: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        error: {
            width: '100%',
            paddingTop: theme.spacing.md,
            color: theme.colors.red,
            textAlign: 'center',
        },
        errorSuggestion: {
            color: theme.colors.red,
        },
        clickableSuggestion: {
            textDecorationLine: 'underline',
        },
        numpad: {
            width: '100%',
            maxWidth: Math.min(400, width),
            paddingHorizontal: theme.spacing.lg,
            flexDirection: 'row',
            flexWrap: 'wrap',
        },
    })

export default AmountInput
