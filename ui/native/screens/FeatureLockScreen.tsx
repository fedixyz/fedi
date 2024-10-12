import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, useTheme } from '@rneui/themed'
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, useWindowDimensions } from 'react-native'

import { maxPinLength, pinNumbers } from '@fedi/common/constants/security'
import { numpadButtons } from '@fedi/common/hooks/amount'
import { useDebounce } from '@fedi/common/hooks/util'
import { ProtectedFeatures, setFeatureUnlocked } from '@fedi/common/redux'

import PinDot from '../components/feature/pin/PinDot'
import { NumpadButton } from '../components/ui/NumpadButton'
import { usePinContext } from '../state/contexts/PinContext'
import { useAppDispatch } from '../state/hooks'
import type { NavigationArgs, RootStackParamList } from '../types/navigation'
import { styles } from './LockScreen'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    keyof RootStackParamList
>

/**
 * Reusable Lock Screen for any protected feature except the app.
 * Is generic and can be used in the place of any other screen component.
 * Does not include the "Forgot PIN" flow or the ability to navigate with dynamic route parameters after unlocking.
 */
const FeatureLockScreen = <T extends keyof RootStackParamList>({
    navigation,
    feature,
    screen,
}: Props & {
    feature: keyof ProtectedFeatures
    screen: NavigationArgs<T>
}) => {
    const [pinDigits, setPinDigits] = useState<Array<number>>([])
    const [timeoutSeconds, setTimeoutSeconds] = useState(0)
    const [, setAttempts] = useState(0)

    const { width } = useWindowDimensions()
    const { theme } = useTheme()

    const timerRef = useRef<NodeJS.Timer | null>(null)
    const debouncedPin = useDebounce(pinDigits, 500)
    const dispatch = useAppDispatch()
    const pin = usePinContext()

    const style = styles(theme, width)

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
                return pin.status === 'set' && pin.check(pinDigits)
                    ? 'correct'
                    : 'incorrect'
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
                key: feature,
                unlocked: true,
            }),
        )

        navigation.navigate(...screen)
    }, [debouncedPin, feature, navigation, dispatch, pin, screen])

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [])

    return (
        <View style={style.container}>
            <View style={style.content}>
                <View style={style.dots}>
                    {pinNumbers.map(i => (
                        <PinDot
                            key={i}
                            status={dotStatus(i)}
                            isLast={i === maxPinLength}
                        />
                    ))}
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

export default FeatureLockScreen
