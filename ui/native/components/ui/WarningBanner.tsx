import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Column, Row } from './Flex'
import SvgImage, { SvgImageName } from './SvgImage'

export type WarningBannerLevel = 'info' | 'warning' | 'error'

export interface WarningBannerProps {
    title?: string
    message: string
    level?: WarningBannerLevel
    icon?: SvgImageName
    /** Optional action rendered under the message, e.g. a review button. */
    action?: React.ReactNode
}

/**
 * Inline, non-blocking notice attached to the thing it describes.
 *
 * A toast is wrong for these: the not-enough-guardians, insufficient-balance
 * and guardian-set-changed messages all have to stay on screen while the user
 * decides what to do about them.
 */
export const WarningBanner: React.FC<WarningBannerProps> = ({
    title,
    message,
    level = 'warning',
    icon = 'Info',
    action,
}) => {
    const { theme } = useTheme()
    const style = styles(theme, level)

    return (
        <Row align="start" gap="sm" style={style.banner}>
            <SvgImage name={icon} size="xs" color={style.accent.color} />
            {/* shrink so a long message wraps instead of running off-screen */}
            <Column gap="xs" grow shrink>
                {title && (
                    <Text caption bold color={style.accent.color}>
                        {title}
                    </Text>
                )}
                {/* the design tints the body with the level too, rather than
                    dropping it to neutral grey */}
                <Text small color={style.accent.color}>
                    {message}
                </Text>
                {action}
            </Column>
        </Row>
    )
}

/**
 * `--amber-deep` from the prototype. `theme.colors.orange` (#DF7B00) is the
 * nearest token and reads far too bright against the soft amber fill.
 *
 * Exported because "this flow is unwell, and working on it" is said in more
 * than one shape — a banner here, an inline status line elsewhere — and the two
 * must not drift to different ambers.
 *
 * TODO(wallet-service): promote to the theme once a second feature needs it.
 */
export const WARNING_BANNER_AMBER = '#B45D00'

/**
 * `--amber-soft` from the prototype. `theme.colors.orange200` (#FFF9DE) is the
 * nearest token and washes out almost to white against a white page.
 */
const AMBER_SOFT = '#FFF5C5'

/**
 * The design system's light blue for the `info` level. `theme.colors.lightGrey`
 * reads as a disabled row rather than a notice.
 */
const BLUE_SOFT = '#BAE0FE'

/**
 * `theme.colors.blue` (#0277F2) on {@link BLUE_SOFT} measures 3.08:1, which
 * fails WCAG AA — the banner's `small` body and `caption bold` title are both
 * 14px, so neither qualifies as large text. This measures 4.86:1.
 *
 * TODO(wallet-service): promote to the theme once a second feature needs it.
 */
const BLUE_DEEP = '#0059B8'

/**
 * Levels whose colours are fixed rather than theme tokens, because the nearest
 * token is either too bright or too washed out. `error` still reads from the
 * theme.
 */
const LEVEL_OVERRIDES: Partial<
    Record<WarningBannerLevel, { accent: string; background: string }>
> = {
    info: { accent: BLUE_DEEP, background: BLUE_SOFT },
    warning: { accent: WARNING_BANNER_AMBER, background: AMBER_SOFT },
}

const styles = (theme: Theme, level: WarningBannerLevel) => {
    const override = LEVEL_OVERRIDES[level]
    const accent = override?.accent ?? theme.colors.red
    return StyleSheet.create({
        banner: {
            backgroundColor: override?.background ?? theme.colors.red100,
            borderColor: accent,
            borderRadius: theme.borders.defaultRadius,
            borderWidth: StyleSheet.hairlineWidth,
            padding: theme.spacing.md,
        },
        accent: {
            color: accent,
        },
    })
}
