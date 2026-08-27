import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Column, Row } from '../../ui/Flex'
import { Skeleton } from '../../ui/Skeleton'

/**
 * How many placeholder rows stand in for the guardian set.
 *
 * Three rather than the requested count: the list is what the wait is for, so
 * a full 19 rows would claim a length the search has not returned yet, and
 * three is enough to read as a list. Exported so the tests pin the count here
 * rather than to a number copied out of this file.
 */
export const GUARDIAN_SEAT_SKELETON_ROWS = 3

/**
 * The guardian list, in placeholder form, while the selection preview runs.
 *
 * It stands where the seat rows will stand and mirrors their metrics — 36pt
 * monogram, name over verification line, pill on the right — so the wait shows
 * the shape of the answer instead of a ring that says only "something is
 * happening".
 */
export const GuardianSeatsSkeleton: React.FC = () => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Column fullWidth>
            {Array.from({ length: GUARDIAN_SEAT_SKELETON_ROWS }).map(
                (_, index) => (
                    <Row
                        key={index}
                        testID="guardian-seat-skeleton"
                        align="center"
                        gap="md"
                        style={style.seatRow}>
                        <Skeleton width={36} height={36} style={style.round} />
                        <Column gap="xs" grow basis={false}>
                            <Skeleton width="45%" height={12} />
                            <Skeleton width="80%" height={10} />
                        </Column>
                        <Skeleton width={64} height={20} style={style.round} />
                    </Row>
                ),
            )}
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        // the seat row's own padding, so the real rows land where these were
        seatRow: {
            paddingHorizontal: theme.spacing.xs,
            paddingVertical: theme.spacing.sm,
        },
        // the monogram and the pill are both fully rounded
        round: {
            borderRadius: 999,
        },
    })
