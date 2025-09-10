import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type KeyboardState = {
    isVisible: boolean
    height: number
    screenHeight: number
    animationDuration: number
}

export interface KeyboardContextValue extends KeyboardState {
    insets: ReturnType<typeof useSafeAreaInsets>
}
