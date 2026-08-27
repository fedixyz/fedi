import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import {
    SERVICE_BADGE_GREY,
    SERVICE_GREEN,
    SERVICE_GREEN_BG,
} from '../../constants/walletServiceTheme'
import { Column, Row } from './Flex'
import { Pressable } from './Pressable'
import SvgImage, { SvgImageName } from './SvgImage'

export interface ProviderCardProps {
    icon: SvgImageName
    name: string
    /** Secondary line under the name. */
    description: React.ReactNode
    isSelected: boolean
    /** Omit on a card that reports state rather than offering a choice. */
    onPress?: () => void
    /** Green pill pinned to the top-right, e.g. "Recommended". */
    badge?: string
    /** Grey pill inline after the name, e.g. "Advanced". */
    nameBadge?: string
    /** Trailing control rendered instead of the selected check. */
    action?: React.ReactNode
    /** Presentational only — the card reports no press. */
    isStatic?: boolean
    testID?: string
}

/**
 * Provider choice row.
 *
 * Matches the prototype's `.provider-card`: a 36pt icon tile beside a
 * name/meta column, a corner badge, and a check that appears only on the
 * selected card. Selected is white on an ink border; unselected is a flat
 * grey card.
 */
export const ProviderCard: React.FC<ProviderCardProps> = ({
    icon,
    name,
    description,
    isSelected,
    onPress,
    badge,
    nameBadge,
    action,
    isStatic,
    testID,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Pressable
            testID={testID}
            onPress={isStatic ? undefined : onPress}
            containerStyle={[
                style.card,
                isSelected ? style.cardSelected : style.cardUnselected,
            ]}>
            <Row align="center" gap={12} grow>
                <Row center style={style.iconTile}>
                    <SvgImage name={icon} size={18} />
                </Row>
                <Column gap="xxs" grow shrink>
                    <Row align="center" gap={4} style={style.nameRow}>
                        <Text
                            style={[
                                style.name,
                                // only the card that carries a corner badge
                                // needs to reserve room for it
                                badge && style.nameWithBadgeGutter,
                            ]}>
                            {name}
                        </Text>
                        {nameBadge && (
                            <Row center style={style.nameBadge}>
                                <Text style={style.nameBadgeText}>
                                    {nameBadge.toUpperCase()}
                                </Text>
                            </Row>
                        )}
                    </Row>
                    {typeof description === 'string' ? (
                        <Text
                            style={[
                                style.meta,
                                // the check is absolute, so the text reserves
                                // room for it; an in-flow action does not
                                !action && style.metaWithCheckGutter,
                            ]}>
                            {description}
                        </Text>
                    ) : (
                        description
                    )}
                </Column>
                {action}
            </Row>
            {badge && (
                <Row center style={style.badge}>
                    <Text style={style.badgeText}>{badge.toUpperCase()}</Text>
                </Row>
            )}
            {/* a static card is presentational: there is nothing to check */}
            {!action && isSelected && !isStatic && (
                <SvgImage
                    name="Check"
                    size={22}
                    containerStyle={style.check}
                    svgProps={{ strokeWidth: 2.4 }}
                />
            )}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            borderRadius: 14,
            borderWidth: 1,
            // axis-specific, because Pressable's base container sets
            // paddingVertical/Horizontal and those beat the shorthand
            paddingHorizontal: 14,
            paddingVertical: 14,
            position: 'relative',
        },
        cardSelected: {
            backgroundColor: theme.colors.white,
            borderColor: theme.colors.primary,
        },
        cardUnselected: {
            // white, not the flat card grey: greying the surface reads as a
            // disabled provider rather than an unpicked one. The ink border and
            // the check carry the selection on their own.
            backgroundColor: theme.colors.white,
            borderColor: theme.colors.dividerGrey,
        },
        iconTile: {
            backgroundColor: theme.colors.grey100,
            borderRadius: 10,
            height: 36,
            width: 36,
        },
        nameRow: {
            // hugs its content so the badge sits against the name rather
            // than being pushed to the card's far edge
            alignSelf: 'flex-start',
            maxWidth: '100%',
        },
        name: {
            color: theme.colors.primary,
            flexShrink: 1,
            fontSize: 14,
            fontWeight: '600',
            lineHeight: 21,
        },
        nameWithBadgeGutter: {
            // reserves the corner badge's width so the name wraps instead of
            // running under it. Wider than the design's 84 because this flow
            // insets 16pt where the design insets 20pt, so the text column
            // has more to give back — same wrap, same line breaks
            paddingRight: 102,
        },
        nameBadge: {
            backgroundColor: theme.colors.grey100,
            borderRadius: 999,
            paddingHorizontal: 7,
            paddingVertical: 2,
        },
        nameBadgeText: {
            color: SERVICE_BADGE_GREY,
            fontSize: 9,
            fontWeight: '700',
            letterSpacing: 0.5,
        },
        meta: {
            color: theme.colors.darkGrey,
            fontSize: 12,
            lineHeight: 17,
        },
        metaWithCheckGutter: {
            // clears the absolutely positioned check
            paddingRight: 52,
        },
        badge: {
            backgroundColor: SERVICE_GREEN_BG,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 3,
            position: 'absolute',
            right: 12,
            top: 11,
        },
        badgeText: {
            color: SERVICE_GREEN,
            fontSize: 9,
            fontWeight: '700',
            letterSpacing: 0.5,
        },
        check: {
            bottom: 0,
            justifyContent: 'center',
            position: 'absolute',
            right: 14,
            top: 0,
        },
    })
