import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react'
import * as Keychain from 'react-native-keychain'
import { z } from 'zod'

import {
    ProtectedFeatures,
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

const service = 'pin' as const

const digitsSchema = z.array(z.number().nonnegative().int().lte(9))

const makePinCheck =
    (password: string) =>
    (digits: Array<number>): boolean => {
        const validation = digitsSchema.safeParse(digits)
        if (!validation.success) return false
        return digits.join('') === password
    }

export function PinContextProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const [hasSetPin, setHasSetPin] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    // wrapped because useState treats a raw function as a lazy initializer
    const [checkFn, setCheckFn] = useState<(digits: Array<number>) => boolean>(
        () => () => false,
    )

    const dispatch = useAppDispatch()
    const protectedFeatures = useAppSelector(selectProtectedFeatures)

    const reloadPinCheck = useCallback(async () => {
        const pin = await Keychain.getGenericPassword({ service })

        if (!pin) {
            setCheckFn(() => () => false)
            setHasSetPin(false)
            setIsLoading(false)
            return
        }

        setCheckFn(() => makePinCheck(pin.password))
        setHasSetPin(true)
        setIsLoading(false)
    }, [])

    const set = useCallback(async (digits: Array<number>) => {
        const password = digitsSchema.parse(digits).join('')

        await Keychain.setGenericPassword(service, password, { service })

        setCheckFn(() => makePinCheck(password))
        setHasSetPin(true)
    }, [])

    const unset = useCallback(async () => {
        await Keychain.resetGenericPassword({ service })

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

        await reloadPinCheck()
    }, [dispatch, protectedFeatures, reloadPinCheck])

    useEffect(() => {
        reloadPinCheck()
    }, [reloadPinCheck])

    const value: UsePinReturn = useMemo(
        () =>
            isLoading
                ? { status: 'loading' }
                : hasSetPin
                  ? { status: 'set', check: checkFn, set, unset }
                  : { status: 'unset', set },
        [isLoading, hasSetPin, checkFn, set, unset],
    )

    return <PinContext.Provider value={value}>{children}</PinContext.Provider>
}

export function usePinContext() {
    return useContext(PinContext)
}
