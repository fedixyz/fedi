import { Theme, Tooltip, useTheme } from '@rneui/themed'
import { useEffect, useRef, useState } from 'react'
import {
    ScaledSize,
    StyleSheet,
    useWindowDimensions,
    View,
    ViewProps,
} from 'react-native'

import SvgImage, { SvgImageName, SvgImageProps } from './SvgImage'

/** How often an open tooltip checks its icon has not moved. */
const ANCHOR_WATCH_INTERVAL_MS = 100

/** Movement under a point is measurement noise, not a reflow. */
const ANCHOR_DRIFT_TOLERANCE = 1

/**
 * Displays a tooltip with a "Help" icon that is used to display information on press.
 * Includes a backdrop.
 * Automatically sizes itself to fit the tooltip content.
 */
export default function HelpTooltip({
    children,
    svgProps,
    svgName = 'Help',
    hitSlop,
}: {
    svgProps?: Omit<SvgImageProps, 'name'>
    /** Defaults to the "?" icon; use "Info" where the design shows an ⓘ. */
    svgName?: SvgImageName
    children: React.ReactNode
    hitSlop?: ViewProps['hitSlop']
}) {
    const [open, setOpen] = useState(false)
    const [tooltipWidth, setTooltipWidth] = useState(0)
    const [tooltipHeight, setTooltipHeight] = useState(0)
    const { theme } = useTheme()
    const dimensions = useWindowDimensions()
    // wraps the tooltip, not the icon: the icon is rendered again inside the
    // open tooltip's modal, and a ref would point at that copy, which never
    // moves
    const anchorRef = useRef<View>(null)
    // where the anchor stood when the tooltip opened, in window coordinates
    const anchorOrigin = useRef<{ x: number; y: number } | null>(null)

    /*
     * The bubble is placed once, from the anchor's position on open, so a
     * reflow underneath leaves it pointing at nothing. Dismissing rather than
     * following: following would mean owning the placement maths, the
     * screen-edge clamping and the pointer.
     */
    useEffect(() => {
        if (!open) {
            anchorOrigin.current = null
            return
        }
        // the test renderer's host instances carry no measuring methods
        const measureAnchor = (onMeasured: (x: number, y: number) => void) =>
            anchorRef.current?.measureInWindow?.(onMeasured)

        // the origin is taken now rather than on the first tick: a reflow
        // inside that first interval would otherwise be recorded as the origin
        // and never read as movement
        measureAnchor((x, y) => {
            anchorOrigin.current = { x, y }
        })
        const watch = setInterval(() => {
            measureAnchor((x, y) => {
                const origin = anchorOrigin.current
                if (!origin) return
                if (
                    Math.abs(y - origin.y) > ANCHOR_DRIFT_TOLERANCE ||
                    Math.abs(x - origin.x) > ANCHOR_DRIFT_TOLERANCE
                ) {
                    setOpen(false)
                }
            })
        }, ANCHOR_WATCH_INTERVAL_MS)
        return () => clearInterval(watch)
    }, [open])

    const style = styles(theme, dimensions)

    return (
        <>
            <View ref={anchorRef}>
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
                    popover={
                        <View style={style.contentWrapper}>{children}</View>
                    }>
                    {/* The icon is deliberately not pressable itself. The
                        tooltip measures its anchor inside its own press
                        handler, and a nested Pressable wins the responder race
                        and swallows that press: the tooltip then opens against
                        the position the icon held at mount, which on a screen
                        that starts in a loading shape is a layout shift out of
                        date. */}
                    <View style={style.iconWrapper} hitSlop={hitSlop}>
                        <SvgImage
                            maxFontSizeMultiplier={
                                theme.multipliers.defaultMaxFontMultiplier
                            }
                            name={svgName}
                            {...svgProps}
                        />
                    </View>
                </Tooltip>
            </View>
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
        // the padding PressableIcon gave the icon, so the touch target and the
        // spacing beside it are unchanged
        iconWrapper: {
            alignItems: 'center',
            paddingHorizontal: theme.spacing.xs,
            paddingVertical: theme.spacing.xs,
        },
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
