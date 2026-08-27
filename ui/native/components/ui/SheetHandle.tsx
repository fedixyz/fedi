import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Row } from './Flex'

/**
 * The grab bar every bottom sheet in this flow wears.
 *
 * `CustomOverlay` draws none of its own and pads 24pt above its header, where
 * the design puts the handle 8pt from the sheet's top edge — hence the
 * negative margin. Shared rather than repeated so the sheets cannot drift
 * apart on either the bar or its offset.
 */
export const SheetHandle: React.FC = () => {
    const style = styles(useTheme().theme)

    return (
        <Row center fullWidth style={style.row}>
            <Row style={style.bar} />
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bar: {
            backgroundColor: theme.colors.dividerGrey,
            borderRadius: 999,
            height: 4,
            width: 60,
        },
        row: {
            marginTop: -16,
            paddingBottom: 14,
        },
    })
