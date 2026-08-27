import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Row } from './Flex'
import HelpTooltip from './HelpTooltip'

export interface SummaryRowProps {
    label: string
    /** Right-hand value. A node lets callers render a Placeholder or skeleton. */
    value: React.ReactNode
    /** Renders an ⓘ after the value with this explanation. */
    help?: string
    /** De-emphasise the value, e.g. while a fresh quote is loading. */
    isStale?: boolean
    /** Drop the hairline, for the first row in a group. */
    isFirst?: boolean
    /**
     * Promote the key to bold ink, and push the value hard right, for a row
     * that carries the screen's commitment rather than a detail. `.summary-stat`
     * keys are otherwise a light grey. The value keeps its normal weight.
     */
    isEmphasised?: boolean
}

/**
 * One key/value line, hairline-separated from the row above.
 *
 * Matches the prototype's `.summary-stat`: 13px throughout, grey key against a
 * medium-weight ink value, with the ⓘ trailing the value rather than the label.
 */
export const SummaryRow: React.FC<SummaryRowProps> = ({
    label,
    value,
    help,
    isStale,
    isFirst,
    isEmphasised,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Row
            align="center"
            gap="sm"
            style={[style.row, isFirst && style.first]}>
            <Text style={[style.key, isEmphasised && style.keyEmphasised]}>
                {label}
            </Text>
            <Row
                align="center"
                gap="xs"
                style={[
                    style.valueSide,
                    isEmphasised && style.valueSideEmphasised,
                ]}>
                {typeof value === 'string' ? (
                    <Text
                        style={[
                            style.value,
                            isEmphasised && style.valueEmphasised,
                            isStale && style.valueStale,
                        ]}
                        numberOfLines={1}>
                        {value}
                    </Text>
                ) : (
                    value
                )}
                {help && (
                    <HelpTooltip
                        svgName="Info"
                        svgProps={{ color: theme.colors.grey, size: 16 }}>
                        <Text caption>{help}</Text>
                    </HelpTooltip>
                )}
            </Row>
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        row: {
            borderTopColor: theme.colors.dividerGrey,
            borderTopWidth: 1,
            justifyContent: 'space-between',
            paddingVertical: 7,
        },
        first: {
            borderTopWidth: 0,
        },
        key: {
            color: theme.colors.darkGrey,
            fontSize: 13,
        },
        keyEmphasised: {
            color: theme.colors.primary,
            fontWeight: '600',
        },
        valueSide: {
            flexShrink: 1,
            justifyContent: 'flex-end',
        },
        // take the slack rather than hugging the value, so `flex-end` has
        // something to push the text against
        valueSideEmphasised: {
            flexGrow: 1,
        },
        value: {
            color: theme.colors.primary,
            fontSize: 13,
            fontWeight: '500',
        },
        // only the key gains weight: the value keeps the `.summary-stat` 500
        valueEmphasised: {
            textAlign: 'right',
        },
        valueStale: {
            color: theme.colors.grey,
        },
    })
