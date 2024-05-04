import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme, Text } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'LockScreen'>

/**
 * App Lock Screen.
 * Includes the "Forgot PIN" flow and is specific to unlocking the app.
 * Also takes an optional `routeParams` prop to navigate to a specific screen after unlocking (e.g. deeplinks)
 */
const LockScreen = ({ navigation, route }: Props) => {
    const [pinDigits, setPinDigits] = useState<Array<number>>([])
    const [timeoutSeconds, setTimeoutSeconds] = useState(0)
    const [, setAttempts] = useState(0)

    const { width } = useWindowDimensions()
    const { t } = useTranslation()
    const { theme } = useTheme()

    const timerRef = useRef<NodeJS.Timer | null>(null)
    const debouncedPin = useDebounce(pinDigits, 500)
    const dispatch = useAppDispatch()
    const pin = usePinContext()

    const style = styles(theme, width)

    const isEnteredPinIncorrect = useMemo(
        () =>
            pin.status === 'set' &&
            !pin.check(pinDigits) &&
            pinDigits.length === maxPinLength,
        [pin, pinDigits],
    )

    const setTimedOut = useCallback((attempts: number) => {
        if (timerRef.current) clearInterval(timerRef.current)
        setTimeoutSeconds(attempts > 4 ? 21 : attempts > 3 ? 7 : 3)
        timerRef.current = setInterval(() => {
            setTimeoutSeconds(prevSeconds => {
                if (prevSeconds === 0) {
                    if (timerRef.current) clearInterval(timerRef.current)
                    return 0
                }
                return prevSeconds - 1
            })
        }, 1000)
    }, [])

    const handleNumpadPress = useCallback(
        (btn: (typeof numpadButtons)[number]) => {
            if (btn === null || pin.status !== 'set') return

            if (btn === 'backspace') {
                setPinDigits(pinDigits.slice(0, pinDigits.length - 1))
            } else if (pinDigits.length < maxPinLength) {
                const updatedDigits = [...pinDigits, btn]

                // If adding pressing this numpad causes the PIN to be incorrect
                if (
                    pinDigits.length === maxPinLength - 1 &&
                    !pin.check(updatedDigits)
                )
                    setAttempts(a => {
                        const totalAttempts = a + 1
                        if (totalAttempts > 2) setTimedOut(totalAttempts)
                        return totalAttempts
                    })

                setPinDigits(updatedDigits)
            } else if (!pin.check(pinDigits)) {
                setPinDigits([btn])
            }
        },
        [pinDigits, pin, setTimedOut],
    )

    const dotStatus = useCallback(
        (index: number) => {
            if (pinDigits.length === maxPinLength) {
                if (pin.status === 'set' && pin.check(pinDigits)) {
                    return 'correct'
                }

                return 'incorrect'
            }

            if (index > pinDigits.length) {
                return 'empty'
            }

            return 'active'
        },
        [pinDigits, pin],
    )

    useEffect(() => {
        if (
            debouncedPin.length !== maxPinLength ||
            pin.status !== 'set' ||
            !pin.check(debouncedPin)
        )
            return

        dispatch(
            setFeatureUnlocked({
                key: 'app',
                unlocked: true,
            }),
        )

        if (route.params && 'routeParams' in route.params) {
            navigation.navigate(...route.params.routeParams)
        } else {
            navigation.navigate('TabsNavigator')
        }
    }, [debouncedPin, navigation, dispatch, pin, route.params])

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [])

    return (
        <View style={style.container}>
            <View style={style.content}>
                <View style={style.dots}>
                    {isEnteredPinIncorrect && (
                        <Text style={style.incorrectPin}>
                            {t('feature.pin.pin-doesnt-match')}
                        </Text>
                    )}
                    {pinNumbers.map(i => (
                        <PinDot
                            key={i}
                            status={dotStatus(i)}
                            isLast={i === maxPinLength}
                        />
                    ))}
                    {isEnteredPinIncorrect && (
                        <View style={style.forgotPinButtonContainer}>
                            <Button
                                day
                                title={
                                    <Text caption>
                                        {t('feature.pin.forgot-your-pin')}
                                    </Text>
                                }
                                buttonStyle={style.forgotPinButton}
                                onPress={() => {
                                    navigation.navigate('ResetPinStart')
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
                        disabled={timeoutSeconds > 0}
                    />
                ))}
                {timeoutSeconds > 0 && (
                    <View style={style.timeoutOverlay}>
                        <Text bold h1>
                            0:{String(timeoutSeconds).padStart(2, '0')}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    )
}

export const styles = (theme: Theme, width: number) =>
    StyleSheet.create({
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
            position: 'relative',
        },
        forgotPinButtonContainer: {
            position: 'absolute',
            display: 'flex',
            top: 54,
        },
        incorrectPin: {
            position: 'absolute',
            bottom: 54,
            color: theme.colors.red,
        },
        forgotPinButton: {
            borderColor: theme.colors.lightGrey,
            borderWidth: 0.25,
            paddingHorizontal: 50,
        },
        timeoutOverlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#fffc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default LockScreen
