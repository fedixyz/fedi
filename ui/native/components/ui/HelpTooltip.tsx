import { Theme, Tooltip, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { ScaledSize, StyleSheet, useWindowDimensions, View } from 'react-native'

import { PressableProps } from './Pressable'
import { PressableIcon } from './PressableIcon'

/**
 * Displays a tooltip with a "Help" icon that is used to display information on press.
 * Includes a backdrop.
 * Automatically sizes itself to fit the tooltip content.
 */
export default function HelpTooltip({
    children,
    svgProps,
    ...rest
}: {
    svgProps?: React.ComponentProps<typeof PressableIcon>['svgProps']
    children: React.ReactNode
} & PressableProps) {
    const [open, setOpen] = useState(false)
    const [tooltipWidth, setTooltipWidth] = useState(0)
    const [tooltipHeight, setTooltipHeight] = useState(0)
    const { theme } = useTheme()
    const dimensions = useWindowDimensions()

    const style = styles(theme, dimensions)

    return (
        <>
            <Tooltip
                visible={open}
                onClose={() => setOpen(false)}
                onOpen={() => setOpen(true)}
                closeOnlyOnBackdropPress
                withOverlay
                overlayColor={theme.colors.overlay}
                backgroundColor={theme.colors.blue100}
                width={tooltipWidth}
                height={tooltipHeight}
                containerStyle={{ padding: 0 }}
                popover={<View style={style.contentWrapper}>{children}</View>}>
                <PressableIcon
                    svgName="Help"
                    onPress={e => {
                        e.stopPropagation()
                        setOpen(true)
                    }}
                    svgProps={svgProps}
                    {...rest}
                />
            </Tooltip>
            <View
                style={style.invisibleContent}
                onLayout={e => {
                    setTooltipWidth(e.nativeEvent.layout.width)
                    setTooltipHeight(e.nativeEvent.layout.height)
                }}>
                <View style={style.contentWrapper}>{children}</View>
            </View>
        </>
    )
}

const styles = (theme: Theme, dimensions: ScaledSize) =>
    StyleSheet.create({
        invisibleContent: {
            opacity: 0,
            position: 'absolute',
            top: dimensions.height,
        },
        contentWrapper: {
            maxWidth: dimensions.width * 0.75,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
        },
    })
