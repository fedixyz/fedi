import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Row } from '../../ui/Flex'
import { Skeleton } from '../../ui/Skeleton'

/**
 * Shared with the real card in `CreateWalletService`: the placeholder must be
 * exactly as tall, or the rows above shift when a quote lands and any open
 * tooltip is left pointing at nothing.
 */
export const GUARDIAN_DETAILS_CARD_METRICS = {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
} as const

export const GuardianDetailsSkeleton: React.FC = () => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Row
            fullWidth
            align="center"
            testID="guardian-details-skeleton"
            style={style.card}>
            <Skeleton width="45%" height={LABEL_HEIGHT} />
        </Row>
    )
}

const LABEL_HEIGHT = 14

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            borderColor: theme.colors.dividerGrey,
            // the real row stands at its chevron's height, not its label's
            minHeight: theme.sizes.sm,
            paddingHorizontal: theme.spacing.lg,
            ...GUARDIAN_DETAILS_CARD_METRICS,
        },
    })
