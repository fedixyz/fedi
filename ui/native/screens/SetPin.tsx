import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, useWindowDimensions } from 'react-native'

import { maxPinLength, pinNumbers } from '@fedi/common/constants/security'
import { numpadButtons } from '@fedi/common/hooks/amount'
import { useDebounce } from '@fedi/common/hooks/util'
import { setFeatureUnlocked } from '@fedi/common/redux'

import PinDot from '../components/feature/pin/PinDot'
import { NumpadButton } from '../components/ui/NumpadButton'
import { usePinContext } from '../state/contexts/PinContext'
import { useAppDispatch } from '../state/hooks'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'SetPin'>

const SetPin: React.FC<Props> = ({ navigation }: Props) => {
    const { width } = useWindowDimensions()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [confirmPinDigits, setConfirmPinDigits] = useState<Array<number>>([])
    const [isReEnteringPin, setIsReEnteringPin] = useState(false)
    const [pinDigits, setPinDigits] = useState<Array<number>>([])
    const debouncedConfirmPin = useDebounce(confirmPinDigits)
    const debouncedPin = useDebounce(pinDigits)
    const dispatch = useAppDispatch()
    const pin = usePinContext()

    const matchesInitialPin = useCallback(
        (digits: Array<number>) =>
            pinDigits.length === digits.length &&
            pinDigits.every((_, i) => pinDigits[i] === digits[i]),
        [pinDigits],
    )
    const isConfirmationReady = confirmPinDigits.length === maxPinLength
    const isConfirmationCorrect =
        isConfirmationReady && matchesInitialPin(confirmPinDigits)

    const style = styles(theme, width)

    const handleNumpadPress = useCallback(
        (btn: (typeof numpadButtons)[number]) => {
            if (btn === null) return

            if (isReEnteringPin) {
                if (btn === 'backspace') {
                    setConfirmPinDigits(
                        confirmPinDigits.slice(0, confirmPinDigits.length - 1),
                    )
                } else if (confirmPinDigits.length < maxPinLength) {
                    const updatedDigits = [...confirmPinDigits, btn]

                    setConfirmPinDigits(updatedDigits)
                } else if (!matchesInitialPin(confirmPinDigits)) {
                    setConfirmPinDigits([btn])
                }
            }

            if (btn === 'backspace') {
                setPinDigits(pinDigits.slice(0, pinDigits.length - 1))
            } else if (pinDigits.length < maxPinLength) {
                const updatedDigits = [...pinDigits, btn]

                setPinDigits(updatedDigits)
            }
        },
        [isReEnteringPin, confirmPinDigits, pinDigits, matchesInitialPin],
    )

    const dotStatus = useCallback(
        (index: number) => {
            if (isReEnteringPin) {
                if (isConfirmationReady) {
                    return isConfirmationCorrect ? 'correct' : 'incorrect'
                }

                if (index > confirmPinDigits.length) return 'empty'

                return 'active'
            }

            if (pinDigits.length === maxPinLength) {
                return 'correct'
            }

            if (index > pinDigits.length) {
                return 'empty'
            }

            return 'active'
        },
        [
            isReEnteringPin,
            confirmPinDigits,
            isConfirmationCorrect,
            isConfirmationReady,
            pinDigits,
        ],
    )

    useEffect(() => {
        if (
            debouncedConfirmPin?.length !== maxPinLength ||
            pin.status === 'loading'
        )
            return

        if (matchesInitialPin(debouncedConfirmPin)) {
            pin.set(debouncedConfirmPin)
            dispatch(
                setFeatureUnlocked({
                    key: 'app',
                    unlocked: true,
                }),
            )
            navigation.dispatch(reset('CreatedPin'))
        }
    }, [debouncedConfirmPin, dispatch, matchesInitialPin, navigation, pin])

    useEffect(() => {
        if (debouncedPin?.length === maxPinLength) setIsReEnteringPin(true)
    }, [debouncedPin])

    return (
        <View style={style.container}>
            <View style={style.content}>
                <View style={style.dots}>
                    {isReEnteringPin &&
                    isConfirmationReady &&
                    !isConfirmationCorrect ? (
                        <Text
                            style={[
                                style.reEnterIndicator,
                                style.incorrectPin,
                            ]}>
                            {t('feature.pin.pin-doesnt-match')}
                        </Text>
                    ) : isReEnteringPin ? (
                        <Text style={style.reEnterIndicator}>
                            {t('feature.pin.re-enter-pin')}
                        </Text>
                    ) : null}

                    {pinNumbers.map(i => (
                        <PinDot
                            key={i}
                            status={dotStatus(i)}
                            isLast={i === maxPinLength}
                        />
                    ))}
                    {isConfirmationReady && !isConfirmationCorrect && (
                        <View style={style.startOver}>
                            <Button
                                day
                                title={
                                    <Text caption>
                                        {t('phrases.start-over')}
                                    </Text>
                                }
                                buttonStyle={style.startOverButtonStyle}
                                onPress={() => {
                                    setPinDigits([])
                                    setConfirmPinDigits([])
                                    setIsReEnteringPin(false)
                                }}
                            />
                        </View>
                    )}
                </View>
            </View>
            <View style={style.numpad}>
                {numpadButtons.map(btn => (
                    <NumpadButton
                        key={btn}
                        btn={btn}
                        onPress={() => handleNumpadPress(btn)}
                    />
                ))}
            </View>
        </View>
    )
}

const styles = (theme: Theme, width: number) =>
    StyleSheet.create({
        reEnterIndicator: {
            position: 'absolute',
            bottom: 54,
        },
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
        },
        dots: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
        },
        content: {
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 32,
        },
        numpad: {
            width: '100%',
            maxWidth: Math.min(400, width),
            paddingHorizontal: theme.spacing.lg,
            flexDirection: 'row',
            flexWrap: 'wrap',
        },
        startOver: {
            position: 'absolute',
            display: 'flex',
            top: 54,
        },
        startOverButtonStyle: {
            borderColor: theme.colors.lightGrey,
            borderWidth: 0.25,
            paddingHorizontal: 50,
        },
        incorrectPin: {
            color: theme.colors.red,
        },
    })

export default SetPin
