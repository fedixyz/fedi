import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native'

import { FediGradientVariant } from '@fedi/common/utils/gradients'

import { SvgGradient } from './SvgGradient'

/**
 * Renders a view with a gradient background of a given variant
 */
export default function GradientView({
    variant,
    children,
    style,
    ...props
}: {
    variant: FediGradientVariant
} & ViewProps) {
    let styleProp: StyleProp<ViewStyle> = [styles.relativeView]

    if (style) styleProp = styleProp.concat(style)

    return (
        <View style={styleProp} {...props}>
            <View style={styles.absoluteLayer}>
                {/* has to be rendered inside a View because it isn't being positioned properly on its own*/}
                <SvgGradient variant={variant} style={styles.absoluteLayer} />
            </View>
            {children}
        </View>
    )
}

const styles = StyleSheet.create({
    relativeView: {
        position: 'relative',
        overflow: 'hidden',
    },
    absoluteLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
})
