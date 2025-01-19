import { ThemeSpacing } from '@rneui/base'
import { useTheme } from '@rneui/themed'
import { forwardRef, useCallback, useMemo, useState } from 'react'
import {
    ScrollView,
    StyleSheet,
    SafeAreaView as NativeSafeAreaView,
    ViewStyle,
    StyleProp,
    LayoutChangeEvent,
} from 'react-native'
import { EdgeRecord, Edges, SafeAreaView } from 'react-native-safe-area-context'

/**
 * Edge presets for the `SafeAreaContainer` component.
 *
 * TL;DR,
 *  - `additive` = inset padding + style padding
 *  - `maximum` = Math.max(inset padding, style padding)
 *  - `off` = no padding
 *
 * See the [react-native-safe-area-context docs](https://github.com/th3rdwave/react-native-safe-area-context?tab=readme-ov-file#edges) for more information.
 *
 * - `horizontal`: `additive` padding on the left and right edges. No vertical padding.
 * - `vertical`: `maximum` padding on the top and bottom edges. No horizontal padding.
 * - `bottom`: `maximum` padding on the bottom edge. No horizontal padding.
 * - `top`: `maximum` padding on the top edge. No horizontal padding.
 * - `all`: `maximum` vertical padding, `additive` horizontal padding.
 * - `notop`: `maximum` padding on the bottom, `additive` horizontal padding.
 * - `none`: no padding on any edges.
 */
export type EdgePreset =
    | 'horizontal'
    | 'vertical'
    | 'bottom'
    | 'top'
    | 'all'
    | 'notop'
    | 'none'

interface SafeAreaContainerProps {
    edges: Edges | EdgePreset
    padding?: keyof ThemeSpacing
}

/**
 * Creates a scrollable area with safe area padding.
 */
export const SafeScrollArea = forwardRef<
    ScrollView,
    React.ComponentProps<typeof ScrollView> &
        SafeAreaContainerProps & {
            safeAreaContainerStyle?: StyleProp<ViewStyle>
        }
>(
    (
        {
            style: styleProp,
            contentContainerStyle,
            children,
            edges,
            padding,
            ...props
        },
        ref,
    ) => {
        const [viewHeight, setViewHeight] = useState<number | null>(null)
        const iterableStyle = Array.isArray(styleProp) ? styleProp : [styleProp]
        const iterableContentContainerStyle = Array.isArray(
            contentContainerStyle,
        )
            ? contentContainerStyle
            : [contentContainerStyle]
        const iterableSafeAreaContainerStyle = Array.isArray(
            props.safeAreaContainerStyle,
        )
            ? props.safeAreaContainerStyle
            : [props.safeAreaContainerStyle]

        const onLayout = useCallback(
            (e: LayoutChangeEvent) => {
                if (typeof viewHeight === 'number') return

                setViewHeight(e.nativeEvent.layout.height)
            },
            [viewHeight],
        )

        return (
            <ScrollView
                ref={ref}
                style={[style.scrollContainer, iterableStyle]}
                onLayout={onLayout}
                contentContainerStyle={[
                    viewHeight ? { minHeight: viewHeight } : null,
                    iterableContentContainerStyle,
                ]}
                overScrollMode="auto"
                alwaysBounceVertical={false}
                {...props}>
                <SafeAreaContainer
                    // Try to span the screen height so content doesn't look squashed to the minimum
                    style={[
                        style.scrollContainer,
                        ...iterableSafeAreaContainerStyle,
                    ]}
                    edges={edges}
                    padding={padding}>
                    {children}
                </SafeAreaContainer>
            </ScrollView>
        )
    },
)

/**
 * A wrapper around the `SafeAreaView` component from `react-native-safe-area-context`.
 * Provides a consistent API for safe area padding and edge handling.
 *
 * @param edges - an `EdgePreset` or an `Edges` array/object from `react-native-safe-area-context`.
 * @param padding - the default padding size to apply to each edge. Can be overridden by using `paddingTop`, `paddingBottom`, `paddingLeft`, or `paddingRight` in the `style` prop.
 */
export const SafeAreaContainer = forwardRef<
    NativeSafeAreaView,
    Omit<React.ComponentProps<typeof SafeAreaView>, 'edges'> &
        SafeAreaContainerProps
>(({ style: styleProp, padding = 'lg', edges, ...props }, ref) => {
    const { theme } = useTheme()

    const iterableStyle = Array.isArray(styleProp) ? styleProp : [styleProp]

    const resolvedEdges = useMemo<Edges>(() => {
        switch (edges) {
            case 'horizontal':
                return {
                    left: 'additive',
                    right: 'additive',
                    bottom: 'off',
                    top: 'off',
                }
            case 'vertical':
                return {
                    left: 'off',
                    right: 'off',
                    bottom: 'maximum',
                    top: 'maximum',
                }
            case 'bottom':
                return {
                    left: 'off',
                    right: 'off',
                    bottom: 'maximum',
                    top: 'off',
                }
            case 'top':
                return {
                    left: 'off',
                    right: 'off',
                    bottom: 'off',
                    top: 'maximum',
                }
            case 'all':
                return {
                    left: 'additive',
                    right: 'additive',
                    bottom: 'maximum',
                    top: 'maximum',
                }
            case 'notop':
                return {
                    left: 'additive',
                    right: 'additive',
                    bottom: 'maximum',
                    top: 'off',
                }
            case 'none':
                return {
                    left: 'off',
                    right: 'off',
                    bottom: 'off',
                    top: 'off',
                }
            default:
                return edges
        }
    }, [edges])

    const resolvedPadding = useMemo(() => {
        if (Array.isArray(resolvedEdges)) return null

        const edgs = resolvedEdges as EdgeRecord

        return {
            paddingTop: edgs.top === 'off' ? 0 : theme.spacing[padding],
            paddingBottom: edgs.bottom === 'off' ? 0 : theme.spacing[padding],
            paddingLeft: edgs.left === 'off' ? 0 : theme.spacing[padding],
            paddingRight: edgs.right === 'off' ? 0 : theme.spacing[padding],
        }
    }, [resolvedEdges, theme, padding])

    return (
        <SafeAreaView
            ref={ref}
            style={[style.container, resolvedPadding, iterableStyle]}
            edges={resolvedEdges}
            {...props}
        />
    )
})

const style = StyleSheet.create({
    scrollContainer: {
        flex: 1,
        width: '100%',
    },
    container: {
        flex: 1,
    },
})
