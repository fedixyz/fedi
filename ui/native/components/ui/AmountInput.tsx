import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
    Pressable,
    StyleProp,
    StyleSheet,
    TextInput,
    TextStyle,
    Vibration,
    View,
    useWindowDimensions,
} from 'react-native'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSequence,
    withTiming,
} from 'react-native-reanimated'

import { useAmountInput } from '@fedi/common/hooks/amount'
import { Federation, Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { getCurrencyCode } from '@fedi/common/utils/currency'
import { makeLog } from '@fedi/common/utils/log'

import { useForceBlurOnKeyboardHide } from '../../utils/hooks/keyboard'
import { Row, Column } from './Flex'
import InvisibleInput from './InvisibleInput'
import NotesInput from './NotesInput'
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
    error?: string | null
    notes?: string
    notesLabel?: string
    notesOptional?: boolean
    setNotes?: (notes: string) => void
    content?: React.ReactNode | null
    preHeader?: React.ReactNode | null
    federationId?: Federation['id']
    /**
     * Size the keypad to the room this component was actually given, instead
     * of to the window.
     *
     * `NumpadButton` defaults to a 68pt row off the window height, which is
     * right on a screen the keypad owns. In a bottom sheet it is a fixed 272pt
     * claim against a box that may be shorter, and the bottom row — `0` and
     * backspace — ends up behind the sheet's pinned button. Set this and the
     * rows divide up what is left below the amount instead.
     */
    fitNumpadToSpace?: boolean
}

const NUMPAD_ROWS = 4
/** Below this a row is too small to hit reliably; the sheet must grow instead. */
const NUMPAD_MIN_ROW_HEIGHT = 44
/** The full-screen row height, which is also the most a fitted keypad takes. */
const NUMPAD_MAX_ROW_HEIGHT = 68

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
    error: customError,
    notes = '',
    notesLabel,
    setNotes,
    notesOptional = true,
    content = null,
    preHeader = null,
    federationId,
    fitNumpadToSpace = false,
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
    } = useAmountInput(
        amount,
        onChangeAmount,
        minimumAmount,
        maximumAmount,
        federationId,
    )
    const inputRef = useRef<TextInput>(null)
    const { height, width } = useWindowDimensions()

    // Both are measured rather than assumed: the amount block's height depends
    // on the currency switcher, the error line and whatever `content` a caller
    // passed, none of which this component can predict. Only read while
    // `fitNumpadToSpace` is set.
    const [boxHeight, setBoxHeight] = useState(0)
    const [amountsHeight, setAmountsHeight] = useState(0)
    const numpadButtonHeight = useMemo(() => {
        if (!fitNumpadToSpace || !boxHeight || !amountsHeight) return undefined
        const perRow = Math.floor((boxHeight - amountsHeight) / NUMPAD_ROWS)
        return Math.max(
            NUMPAD_MIN_ROW_HEIGHT,
            Math.min(NUMPAD_MAX_ROW_HEIGHT, perRow),
        )
    }, [fitNumpadToSpace, boxHeight, amountsHeight])

    // For some reason the TextInput inside InvisibleInput does not
    // automatically blur the input when the keyboard is dismissed
    // which causes the .focus() event to have no effect so here we
    // force the blur to make sure .isFocused() returns false
    useForceBlurOnKeyboardHide(true)

    const style = styles(theme, width)

    useEffect(() => {
        if (lockToFiat) setIsFiat(true)
    }, [lockToFiat, setIsFiat])

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
                <Text style={style.error} caption testID="amount-input-error">
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

    const shake = useSharedValue(0)
    const onRejectedPress = () => {
        Vibration.vibrate(40) // ← added
        shake.value = withSequence(
            withTiming(8, { duration: 50 }),
            withTiming(-8, { duration: 50 }),
            withTiming(0, { duration: 50 }),
        )
    }
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shake.value }],
    }))

    return (
        <Column
            grow
            align="center"
            fullWidth
            onLayout={
                fitNumpadToSpace
                    ? e => setBoxHeight(e.nativeEvent.layout.height)
                    : undefined
            }>
            {/* when fitting, the amount block keeps its natural height so the
                keypad can have the remainder; stretching both leaves nothing
                to divide */}
            <Column
                center
                gap="sm"
                grow={!fitNumpadToSpace}
                style={style.amounts}
                onLayout={
                    fitNumpadToSpace
                        ? e => setAmountsHeight(e.nativeEvent.layout.height)
                        : undefined
                }>
                <Column fullWidth>{preHeader}</Column>
                <Animated.View style={animatedStyle}>
                    <Pressable
                        style={style.primaryAmount}
                        disabled={readOnly || hasNumpad || isSubmitting}
                        onPress={() => inputRef?.current?.focus()}>
                        <InvisibleInput
                            inputRef={inputRef}
                            value={isFiat ? fiatValue : satsValue}
                            label={
                                isFiat
                                    ? getCurrencyCode(currency)
                                    : t('words.sats').toUpperCase()
                            }
                            onChangeText={
                                isFiat ? handleChangeFiat : handleChangeSats
                            }
                            readOnly={readOnly || hasNumpad || isSubmitting}
                        />
                    </Pressable>
                </Animated.View>
                {switcherEnabled && (
                    <Pressable
                        testID="AmountUnitSwitcher"
                        style={style.symbolSwitcher}
                        disabled={readOnly || isSubmitting}
                        onPress={() => setIsFiat(!isFiat)}>
                        <Text
                            style={style.secondaryAmountText}
                            medium
                            caption
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
                <Column center fullWidth style={style.errorContainer}>
                    {customError ? (
                        <Text style={style.error} caption>
                            {customError}
                        </Text>
                    ) : (
                        error
                    )}
                </Column>
                {/**
                 * This Content prop used to be used to pass in error messages.
                 * Now we have a specific prop for that purpose, but some callers still use it.
                 * TODO: update callers that uses "content" to not do this...
                 * we should remove "content" all together in favor of the more specific props
                 */}
                {content && (
                    <Column fullWidth style={style.contentMaxHeight}>
                        {content}
                    </Column>
                )}
                {setNotes && (
                    <View style={style.notesContainer}>
                        <NotesInput
                            label={notesLabel}
                            notes={notes}
                            setNotes={setNotes}
                            isOptional={notesOptional}
                        />
                    </View>
                )}
            </Column>
            {hasNumpad && (
                <Row wrap fullWidth style={style.numpad}>
                    {numpadButtons.map(btn => (
                        <NumpadButton
                            key={btn}
                            btn={btn}
                            onPress={() => {
                                try {
                                    const rejected = handleNumpadPress(btn)
                                    if (rejected) onRejectedPress()
                                } catch (err) {
                                    log.error('handleNumpadPress', err)
                                }
                            }}
                            disabled={isSubmitting}
                            height={numpadButtonHeight}
                        />
                    ))}
                </Row>
            )}
        </Column>
    )
}

const styles = (theme: Theme, width: number) =>
    StyleSheet.create({
        amounts: {
            paddingHorizontal: theme.spacing.lg,
        },
        primaryAmount: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            marginHorizontal: theme.spacing.lg,
            width: '100%',
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
            color: theme.colors.red,
        },
        contentMaxHeight: {
            maxHeight: 60,
            paddingHorizontal: theme.spacing.lg,
        },
        errorSuggestion: {
            color: theme.colors.red,
        },
        clickableSuggestion: {
            textDecorationLine: 'underline',
        },
        numpad: {
            maxWidth: Math.min(400, width),
            paddingHorizontal: theme.spacing.lg,
        },
        notesContainer: {
            width: '100%',
        },
        errorContainer: {
            minHeight: theme.sizes.sm,
        },
    })

export default AmountInput
