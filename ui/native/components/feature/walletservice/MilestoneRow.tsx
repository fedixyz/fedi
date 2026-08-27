import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { Column, Row } from '../../ui/Flex'
import { SUCCESS_PILL_GREEN, SUCCESS_PILL_GREEN_BG } from '../../ui/SuccessPill'
import SvgImage from '../../ui/SvgImage'
import { MilestoneSpinner } from './MilestoneSpinner'

export const MILESTONE_CARD_BG = '#FAFAFA'

/**
 * A single milestone card, animating the prototype's transitions: future cards
 * recede at 40% opacity and the active card lifts to full opacity behind a
 * highlighted border.
 *
 * Every card keeps its detail line in every state, as the design does. Showing
 * it only on the active card made each completed step shrink, which jolted the
 * cards below it down the screen.
 *
 * Lives here rather than inside the creation screen because the Lightning
 * attach reports progress the same way, and one long wait should not be told in
 * two different visual languages.
 */
export const MilestoneRow: React.FC<{
    label: string
    detail: string
    testID: string
    detailTestID: string
    isActive: boolean
    isDone: boolean
}> = ({ label, detail, testID, detailTestID, isActive, isDone }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    const animatedCardStyle = useAnimatedStyle(
        () => ({
            opacity: withTiming(isActive || isDone ? 1 : 0.4, {
                duration: 300,
            }),
            borderColor: withTiming(
                isActive ? theme.colors.lightGrey : theme.colors.dividerGrey,
                { duration: 300 },
            ),
        }),
        [isActive, isDone],
    )

    return (
        <Animated.View
            testID={testID}
            style={[style.milestone, animatedCardStyle]}>
            <Row align="center" gap="md">
                <View
                    style={[
                        style.milestoneIcon,
                        isActive && style.milestoneIconActive,
                        isDone && style.milestoneIconDone,
                    ]}>
                    {isDone ? (
                        <SvgImage
                            name="Check"
                            size={16}
                            color={SUCCESS_PILL_GREEN}
                        />
                    ) : isActive ? (
                        <MilestoneSpinner />
                    ) : null}
                </View>
                <Column gap="xxs" grow shrink>
                    <Text style={style.milestoneLabel}>{label}</Text>
                    <Text style={style.milestoneDetail} testID={detailTestID}>
                        {detail}
                    </Text>
                </Column>
            </Row>
        </Animated.View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        milestone: {
            backgroundColor: MILESTONE_CARD_BG,
            borderColor: theme.colors.dividerGrey,
            borderRadius: 14,
            borderWidth: 1,
            padding: 14,
        },
        milestoneDetail: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 16,
        },
        milestoneIcon: {
            alignItems: 'center',
            backgroundColor: theme.colors.grey100,
            borderRadius: 999,
            height: 28,
            justifyContent: 'center',
            width: 28,
        },
        // no border of its own: `MilestoneSpinner` draws the ring, and a
        // border here would sit outside it as a second, static circle
        milestoneIconActive: {
            backgroundColor: theme.colors.white,
        },
        milestoneIconDone: {
            // muted green from the prototype; the theme's greens are far more
            // saturated, as `SuccessPill` documents
            backgroundColor: SUCCESS_PILL_GREEN_BG,
        },
        milestoneLabel: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '600',
            lineHeight: 18,
        },
    })
