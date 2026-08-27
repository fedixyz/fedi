import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Sticky action bar pinned below the scroll area.
 *
 * Every step in the wallet service flow keeps its commitment reachable without
 * scrolling past the content, with a hairline rule separating it from the page.
 *
 * The bar owns the home indicator inset itself. Most callers sit it outside a
 * `SafeScrollArea`, whose own safe-area padding applies to the scroll content
 * and never reaches a sibling below it, so the button would otherwise land on
 * the indicator. Callers must not add a bottom inset of their own.
 */
/** `.cta-bar` in the design pads `14px 20px 18px`. */
const BAR_PADDING_BOTTOM = 18

export const WalletServiceFooter: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const style = styles(theme)

    return (
        <View
            style={[
                style.bar,
                // read from the constant, not back off the stylesheet: RN may
                // hand back a registered id rather than the object, which makes
                // the sum NaN and silently drops the inset
                { paddingBottom: BAR_PADDING_BOTTOM + insets.bottom },
            ]}>
            {children}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bar: {
            backgroundColor: theme.colors.white,
            // #f0f0f2 in the design; dividerGrey is the nearest theme token
            borderTopColor: theme.colors.dividerGrey,
            borderTopWidth: 1,
            gap: theme.spacing.lg,
            paddingBottom: BAR_PADDING_BOTTOM,
            paddingHorizontal: 20,
            paddingTop: 14,
        },
    })
