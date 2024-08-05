import {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
} from 'react'
import * as Keychain from 'react-native-keychain'
import { z } from 'zod'

import {
    ProtectedFeatures,
    selectDeviceId,
    selectProtectedFeatures,
    setFeatureUnlocked,
} from '@fedi/common/redux'

import { useAppDispatch, useAppSelector } from '../hooks'

interface UsePinLoading {
    status: 'loading'
}

interface UsePinUnset {
    status: 'unset'
    set: (digits: Array<number>) => Promise<void>
}

interface UsePinSet {
    status: 'set'
    check: (digits: Array<number>) => boolean
    set: (digits: Array<number>) => Promise<void>
    unset: () => Promise<void>
}

type UsePinReturn = UsePinLoading | UsePinUnset | UsePinSet

const PinContext = createContext<UsePinReturn>({ status: 'loading' })

export function PinContextProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const [hasSetPin, setHasSetPin] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const checkRef = useRef<(digits: Array<number>) => boolean>(() => false)
    const deviceId = useAppSelector(selectDeviceId)
    const dispatch = useAppDispatch()
    const protectedFeatures = useAppSelector(selectProtectedFeatures)

    const set = useCallback(
        async (digits: Array<number>) => {
            if (!deviceId) return

            const parsedDigits = z
                .array(z.number().nonnegative().int().lte(9))
                .parse(digits)

            await Keychain.setGenericPassword(deviceId, parsedDigits.join(''), {
                service: 'pin',
            })
        },
        [deviceId],
    )

    const unset = useCallback(async () => {
        if (!deviceId) return

        await Keychain.resetGenericPassword({
            service: 'pin',
        })

        // Immediately unlocks all protected features once the pin is unset
        for (const [key, isProtected] of Object.entries(protectedFeatures)) {
            if (!isProtected) continue

            dispatch(
                setFeatureUnlocked({
                    key: key as keyof ProtectedFeatures,
                    unlocked: true,
                }),
            )
        }
    }, [deviceId, dispatch, protectedFeatures])

    useEffect(() => {
        const loadPinCheck = async () => {
            const pin = await Keychain.getGenericPassword({ service: 'pin' })

            if (
                pin &&
                pin.username === deviceId &&
                pin.service === 'pin' &&
                typeof pin.password === 'string'
            ) {
                checkRef.current = (digits: Array<number>) => {
                    const digitsValidation = z
                        .array(z.number().nonnegative().int().lte(9))
                        .safeParse(digits)

                    if (!digitsValidation.success) return false

                    return digits.join('') === pin.password
                }
                setHasSetPin(true)
            }

            setIsLoading(false)
        }

        loadPinCheck()
    }, [deviceId])

    const value: UsePinReturn = useMemo(
        () =>
            isLoading
                ? { status: 'loading' }
                : hasSetPin
                ? { status: 'set', check: checkRef.current, set, unset }
                : { status: 'unset', set },
        [isLoading, hasSetPin, checkRef, set, unset],
    )

    return <PinContext.Provider value={value}>{children}</PinContext.Provider>
}

export function usePinContext() {
    return useContext(PinContext)
}
