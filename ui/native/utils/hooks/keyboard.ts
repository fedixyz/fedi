import { useEffect, useMemo, useState } from 'react'
import {
    Keyboard,
    KeyboardEvent,
    Platform,
    Dimensions,
    TextInput,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { makeLog } from '@fedi/common/utils/log'

import {
    AndroidScreenSize,
    CHAT_KEYBOARD_BEHAVIOR,
    DEFAULT_ANIMATION_DURATION,
    DEFAULT_KEYBOARD_HEIGHT_FALLBACK,
    KEYBOARD_PADDING,
} from '../../constants'
import { KeyboardContextValue, KeyboardState } from '../../types/keyboard'
import { getAndroidScreenSize, isAndroidAPI35Plus } from '../layout'

const log = makeLog('native/utils/keyboard')

class KeyboardManager {
    private listeners = new Set<(state: KeyboardState) => void>()
    private currentState: KeyboardState = {
        isVisible: false,
        height: 0,
        screenHeight: Dimensions.get('window').height,
        animationDuration: DEFAULT_ANIMATION_DURATION,
    }
    private keyboardListeners: { remove: () => void }[] = []
    private dimensionSubscription: { remove: () => void } | null = null
    private isInitialized = false
    private cleanupScheduled = false

    private forceBlurTokens = new Set<symbol>()

    private forceBlurIfFocused = () => {
        const node = TextInput.State.currentlyFocusedInput?.()
        if (node) TextInput.State.blurTextInput?.(node)
    }

    private isForceBlurEnabled = () => this.forceBlurTokens.size > 0

    enableForceBlurOnHide = (token: symbol) => {
        this.forceBlurTokens.add(token)
    }
    disableForceBlurOnHide = (token: symbol) => {
        this.forceBlurTokens.delete(token)
    }

    private isValidHeight(height: unknown): height is number {
        return (
            typeof height === 'number' && height >= 0 && Number.isFinite(height)
        )
    }

    private initialize() {
        if (this.isInitialized) return
        this.isInitialized = true

        try {
            this.keyboardListeners = [
                Keyboard.addListener(
                    'keyboardDidShow',
                    this.handleKeyboardShow,
                ),
                Keyboard.addListener(
                    'keyboardDidHide',
                    this.handleKeyboardHide,
                ),
                Keyboard.addListener(
                    'keyboardWillShow',
                    this.handleKeyboardWillShow,
                ),
                Keyboard.addListener(
                    'keyboardWillHide',
                    this.handleKeyboardWillHide,
                ),
            ]

            this.dimensionSubscription = Dimensions.addEventListener(
                'change',
                ({ window }) => {
                    if (this.isValidHeight(window.height)) {
                        this.updateState({ screenHeight: window.height })
                    }
                },
            )
        } catch (error) {
            log.error(
                'KeyboardManager: Failed to initialize keyboard listeners',
                error,
            )
        }
    }

    private handleKeyboardShow = (e?: KeyboardEvent) => {
        const height = e?.endCoordinates?.height
        const duration = e?.duration

        if (this.isValidHeight(height)) {
            this.updateState({
                isVisible: true,
                height,
                animationDuration:
                    typeof duration === 'number' && duration > 0
                        ? duration
                        : DEFAULT_ANIMATION_DURATION,
            })
        } else {
            this.updateState({
                isVisible: true,
                height: DEFAULT_KEYBOARD_HEIGHT_FALLBACK,
                animationDuration: DEFAULT_ANIMATION_DURATION,
            })
        }
    }

    private handleKeyboardWillShow = (e?: KeyboardEvent) => {
        const duration = e?.duration
        const height = e?.endCoordinates?.height
        const hasDuration = typeof duration === 'number' && duration > 0
        //needed for messageInput / stale height SIM issues on Android
        if (this.isValidHeight(height)) {
            this.updateState({
                isVisible: true,
                height,
                animationDuration: hasDuration
                    ? duration
                    : this.currentState.animationDuration,
            })
        } else if (hasDuration) {
            this.updateState({ animationDuration: duration })
        }
    }

    private handleKeyboardWillHide = (e?: KeyboardEvent) => {
        const duration = e?.duration
        if (typeof duration === 'number' && duration > 0) {
            this.updateState({ animationDuration: duration })
        }
        // Opt-in workaround: clear stale focus after dismiss on Android
        if (Platform.OS === 'android' && this.isForceBlurEnabled()) {
            this.forceBlurIfFocused()
        }
    }

    private handleKeyboardHide = (e?: KeyboardEvent) => {
        const duration = e?.duration
        this.updateState({
            isVisible: false,
            height: 0,
            animationDuration:
                typeof duration === 'number' && duration > 0
                    ? duration
                    : DEFAULT_ANIMATION_DURATION,
        })
        if (Platform.OS === 'android' && this.isForceBlurEnabled()) {
            this.forceBlurIfFocused()
        }
    }

    private updateState(updates: Partial<KeyboardState>) {
        this.currentState = { ...this.currentState, ...updates }
        this.notifyListeners()
    }

    private notifyListeners() {
        for (const listener of this.listeners) {
            try {
                listener(this.currentState)
            } catch (error) {
                log.error('KeyboardManager: Error notifying listener', error)
            }
        }
    }

    private cleanup = () => {
        // only cleanup if still initialized and truly no listeners left.
        if (!this.isInitialized || this.listeners.size > 0) return

        this.keyboardListeners.forEach(l => l.remove?.())
        this.keyboardListeners = []

        this.dimensionSubscription?.remove?.()
        this.dimensionSubscription = null

        this.listeners.clear()
        this.isInitialized = false
    }

    subscribe(listener: (state: KeyboardState) => void) {
        this.initialize()
        this.listeners.add(listener)

        // Prevent reusing a stale keyboardState (e.g., height > 0 after navigating)
        if (
            Platform.OS === 'android' &&
            (this.currentState.isVisible || this.currentState.height > 0)
        ) {
            this.currentState = {
                ...this.currentState,
                isVisible: false,
                height: 0,
                animationDuration: DEFAULT_ANIMATION_DURATION,
            }
        }

        // Emit current state to the new subscriber
        listener(this.currentState)

        return () => {
            this.listeners.delete(listener)

            if (!this.isInitialized) return

            // We defer cleanup to the next tick instead of calling it immediately (setTimeout):
            // - to avoid tearing down listeners in the middle of an RN keyboard event dispatch
            // - to prevent thrashing if another subscriber mounts later in the same tick
            if (!this.cleanupScheduled) {
                this.cleanupScheduled = true
                setTimeout(() => {
                    this.cleanupScheduled = false
                    this.cleanup() // guarded: only runs if still no listeners
                }, 0)
            }
        }
    }

    // exposed for hooks to bootstrap state from the latest known value (instead of hardcoding an "empty" keyboard state).
    getCurrentState() {
        return this.currentState
    }
}

const keyboardManager = new KeyboardManager()

export const useKeyboard = (): KeyboardContextValue => {
    const insets = useSafeAreaInsets()
    const [keyboardState, setKeyboardState] = useState(() =>
        keyboardManager.getCurrentState(),
    )

    useEffect(() => keyboardManager.subscribe(setKeyboardState), [])

    return useMemo(
        () => ({ ...keyboardState, insets }),
        [keyboardState, insets],
    )
}

export const useChatKeyboardBehavior = (): {
    bottomOffset: number
    setMessageInputHeight: React.Dispatch<React.SetStateAction<number>>
    keyboardPadding: number
} => {
    const {
        isVisible,
        height: keyboardHeight,
        screenHeight,
        insets,
    } = useKeyboard()
    const [messageInputHeight, setMessageInputHeight] = useState(0)

    const calculatedBottomOffset = useMemo(() => {
        // If the keyboard isn't visible, don't lift the conversation at all.
        if (!isVisible) return 0

        let offset = messageInputHeight

        if (Platform.OS === 'android' && keyboardHeight > 0) {
            const responsiveOffset =
                screenHeight * CHAT_KEYBOARD_BEHAVIOR.ANDROID_OFFSET_PERCENT
            offset +=
                Math.max(0, keyboardHeight - insets.bottom) + responsiveOffset
        }

        return Math.min(
            offset,
            screenHeight * CHAT_KEYBOARD_BEHAVIOR.MAX_BOTTOM_PERCENT,
        )
    }, [
        messageInputHeight,
        isVisible,
        keyboardHeight,
        insets.bottom,
        screenHeight,
    ])

    const keyboardPadding = useMemo(() => {
        if (Platform.OS !== 'android' || !isVisible || keyboardHeight === 0)
            return 0

        const screenSize = getAndroidScreenSize(screenHeight)
        const keyboardOffset = Math.max(0, keyboardHeight - insets.bottom)
        const multiplier =
            screenSize === AndroidScreenSize.SMALL
                ? KEYBOARD_PADDING.SMALL_MULTIPLIER
                : KEYBOARD_PADDING.LARGE_MULTIPLIER
        const maxPercent =
            screenSize === AndroidScreenSize.SMALL
                ? KEYBOARD_PADDING.SMALL_MAX_PERCENT
                : KEYBOARD_PADDING.LARGE_MAX_PERCENT

        const padding = keyboardOffset * multiplier
        return Math.min(padding, screenHeight * maxPercent)
    }, [isVisible, keyboardHeight, screenHeight, insets.bottom])

    return {
        bottomOffset: calculatedBottomOffset,
        setMessageInputHeight,
        keyboardPadding,
    }
}

export type ImeFooterLiftOptions = {
    buffer?: number
}

// Android API 35+ seems to have some strange behavior where the
// keyboard openiing does not automatically lift UI content above the
// keyboard so this hook gives us the keyboard height to add to the bottom
// plus an optional buffer as needed
export const useImeFooterLift = (options?: ImeFooterLiftOptions): number => {
    const { buffer = 0 } = options ?? {}
    const { isVisible: keyboardIsVisible, height: keyboardHeight } =
        useKeyboard()
    // Android only behavior
    if (Platform.OS !== 'android') return 0
    // Android API 35+ only
    if (!isAndroidAPI35Plus()) return 0
    const inputFocused = !!TextInput.State.currentlyFocusedInput?.()
    // only when keyboard is open & input is focused
    if (!keyboardIsVisible) return 0
    if (!inputFocused) return 0

    return keyboardHeight + buffer
}

// iOS: detect "keyboard open" with a stale-value guard (default 80px)
export const useIosKeyboardOpen = (threshold: number = 80): boolean => {
    const { isVisible, height, insets } = useKeyboard()
    const inputFocused = !!TextInput.State.currentlyFocusedInput?.()
    return (
        Platform.OS === 'ios' &&
        isVisible &&
        inputFocused &&
        (height ?? 0) - insets.bottom > threshold
    )
}

export const useForceBlurOnKeyboardHide = (enabled = true) => {
    useEffect(() => {
        if (!(Platform.OS === 'android') || !enabled) return
        const token = Symbol('force-blur')
        keyboardManager.enableForceBlurOnHide(token)
        return () => keyboardManager.disableForceBlurOnHide(token)
    }, [enabled])
}

export { keyboardManager }
