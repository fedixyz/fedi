import { useEffect, useMemo, useState, useCallback } from 'react'
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
    ANDROID_INPUT_FOCUS_OFFSET,
    AndroidScreenSize,
    CHAT_KEYBOARD_BEHAVIOR,
    DEFAULT_ANIMATION_DURATION,
    DEFAULT_KEYBOARD_HEIGHT_FALLBACK,
    KEYBOARD_PADDING,
    SCREEN_SIZE_THRESHOLDS,
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
    }

    private handleKeyboardWillShow = (e?: KeyboardEvent) => {
        const duration = e?.duration
        if (typeof duration === 'number' && duration > 0) {
            this.updateState({ animationDuration: duration })
        }
    }

    private handleKeyboardWillHide = (e?: KeyboardEvent) => {
        const duration = e?.duration
        if (typeof duration === 'number' && duration > 0) {
            this.updateState({ animationDuration: duration })
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

export const useAndroidInputFocus = (): {
    focusOffset: number
    handleInputFocus: () => void
} => {
    const [focusOffset, setFocusOffset] = useState(0)
    const { isVisible } = useKeyboard()

    const handleInputFocus = useCallback(() => {
        if (Platform.OS === 'android')
            setFocusOffset(ANDROID_INPUT_FOCUS_OFFSET)
    }, [])

    useEffect(() => {
        if (!isVisible) setFocusOffset(0)
    }, [isVisible])

    return { focusOffset, handleInputFocus }
}

export const useKeyboardStickyPosition = ({
    enabledOnIOS = false,
    enabledOnSmallScreens = false,
    enabledOnMediumScreens = true,
    enabledOnLargeScreens = true,
    smallScreenThreshold = SCREEN_SIZE_THRESHOLDS.SMALL_TO_MEDIUM,
    largeScreenThreshold = SCREEN_SIZE_THRESHOLDS.MEDIUM_TO_LARGE,
    offsetClosed = 0,
    offsetOpened = 20,
}: {
    enabledOnIOS?: boolean
    enabledOnSmallScreens?: boolean
    enabledOnMediumScreens?: boolean
    enabledOnLargeScreens?: boolean
    smallScreenThreshold?: number
    largeScreenThreshold?: number
    offsetClosed?: number
    offsetOpened?: number
} = {}): {
    isActive: boolean
    marginBottom: number
    isKeyboardVisible: boolean
} => {
    const {
        isVisible,
        screenHeight,
        height: keyboardHeight,
        insets,
    } = useKeyboard()

    const isActive = useMemo(() => {
        if (Platform.OS === 'ios') return enabledOnIOS
        if (Platform.OS === 'android') {
            if (screenHeight < smallScreenThreshold)
                return enabledOnSmallScreens
            if (screenHeight < largeScreenThreshold)
                return enabledOnMediumScreens
            return enabledOnLargeScreens
        }
        return false
    }, [
        enabledOnIOS,
        enabledOnSmallScreens,
        enabledOnMediumScreens,
        enabledOnLargeScreens,
        screenHeight,
        smallScreenThreshold,
        largeScreenThreshold,
    ])

    const marginBottom = useMemo(() => {
        if (!isActive) return 0
        if (!isVisible) return offsetClosed

        if (Platform.OS === 'android' && keyboardHeight > 0) {
            const isEdgeToEdge = isAndroidAPI35Plus()
            const keyboardOffset = isEdgeToEdge
                ? keyboardHeight
                : Math.max(0, keyboardHeight - insets.bottom)
            return keyboardOffset + offsetOpened
        }

        return offsetOpened
    }, [
        isActive,
        isVisible,
        keyboardHeight,
        insets.bottom,
        offsetClosed,
        offsetOpened,
    ])

    return {
        isActive,
        marginBottom,
        isKeyboardVisible: isVisible,
    }
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
    insetsBottom: number
    buffer?: number
    threshold?: number
    subtractSafeAreaBottom?: boolean
    // gate override (defaults to Android API 35+)
    gate?: boolean
}

export const useImeFooterLift = ({
    insetsBottom,
    buffer = 0,
    threshold = 0,
    subtractSafeAreaBottom = true,
    gate,
}: ImeFooterLiftOptions): number => {
    const { isVisible, height } = useKeyboard()
    const inputFocused = !!TextInput.State.currentlyFocusedInput?.()
    const enabled = gate ?? isAndroidAPI35Plus()

    if (!(Platform.OS === 'android' && enabled && isVisible && inputFocused))
        return 0

    const base = (height ?? 0) - (subtractSafeAreaBottom ? insetsBottom : 0)
    const delta = Math.max(0, base)
    if (delta <= threshold) return 0
    return delta + buffer
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

export { keyboardManager }
