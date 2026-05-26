import { Theme, useTheme } from '@rneui/themed'
import { StyleSheet } from 'react-native'

import { Pressable, PressableProps } from './Pressable'
import SvgImage, { SvgImageName, SvgImageProps } from './SvgImage'

type Props = {
    svgName: SvgImageName
    maxFontSizeMultiplier?: number
    svgProps?: Omit<SvgImageProps, 'name'>
} & PressableProps

export const PressableIcon: React.FC<Props> = ({
    svgName,
    svgProps,
    containerStyle = {},
    maxFontSizeMultiplier,
    ...props
}) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const multiplier =
        maxFontSizeMultiplier || theme.multipliers.defaultMaxFontMultiplier

    return (
        <Pressable
            containerStyle={[style.container, containerStyle]}
            {...props}>
            <SvgImage
                maxFontSizeMultiplier={multiplier}
                name={svgName}
                {...svgProps}
            />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.xs,
            width: undefined, // unsets width defined in Pressable
        },
        pressed: {
            backgroundColor: theme.colors.primary05,
        },
        image: {
            height: theme.sizes.sm,
            width: theme.sizes.sm,
        },
        label: {
            flexGrow: 1,
            flexShrink: 1,
            color: theme.colors.primary,
            paddingHorizontal: theme.spacing.md,
        },
    })
