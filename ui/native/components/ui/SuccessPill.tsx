import { Text } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import {
    SERVICE_GREEN,
    SERVICE_GREEN_BG,
} from '../../constants/walletServiceTheme'
import { Row } from './Flex'
import SvgImage from './SvgImage'

/**
 * Muted green affirmation chip — "Recommended", "Selected", "Verified".
 *
 * The greens come from the prototype (`--green` / `--green-soft`). The theme's
 * `green`/`green100` are far more saturated and make a passive badge shout.
 * Promote these to the theme if a screen outside this flow needs them.
 */
export const SUCCESS_PILL_GREEN = SERVICE_GREEN
export const SUCCESS_PILL_GREEN_BG = SERVICE_GREEN_BG

export const SuccessPill: React.FC<{
    label: string
    /** Show the leading check. */
    withCheck?: boolean
}> = ({ label, withCheck }) => (
    <Row align="center" gap="xs" style={styles.pill}>
        {withCheck && (
            <SvgImage name="Check" size={12} color={SUCCESS_PILL_GREEN} />
        )}
        <Text style={styles.text}>{label}</Text>
    </Row>
)

const styles = StyleSheet.create({
    pill: {
        backgroundColor: SUCCESS_PILL_GREEN_BG,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
    },
    text: {
        color: SUCCESS_PILL_GREEN,
        fontSize: 11,
        fontWeight: '600',
    },
})
