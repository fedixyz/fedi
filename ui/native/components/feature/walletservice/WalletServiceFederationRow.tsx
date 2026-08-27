import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { Column, Row } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import SvgImage from '../../ui/SvgImage'

/**
 * The wallet service flow's full-width grey card: a 40pt adornment, a name and
 * a detail line, with a disclosure chevron only when there is somewhere to go.
 *
 * Deliberately not `FederationWalletSelector`: that one is a fixed-width mint
 * pill shared with send, chat payment and multispend. This shape is used for
 * the payer on the confirm screen and for both sides of the top-up sheet, so
 * it lives on its own rather than adding a variant to a component three other
 * flows depend on.
 */
export const WalletServiceFederationRow: React.FC<{
    /** Leading 40pt element — usually a `FederationLogo`. */
    adornment: React.ReactNode
    name: string
    /** Second line: a balance, or what this row is for. */
    detail: string
    /** Omitted for a fixed row, which then shows no chevron and does not press. */
    onPress?: () => void
    testID?: string
}> = ({ adornment, name, detail, onPress, testID }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        // no `disabled` prop: the shared Pressable renders that at 25% opacity,
        // and a fixed row is settled rather than blocked. Omitting `onPress` is
        // what makes it inert
        <Pressable testID={testID} containerStyle={style.row} onPress={onPress}>
            <Row align="center" gap="md" grow>
                {adornment}
                <Column gap="xs" grow basis={false}>
                    <Text medium numberOfLines={1} style={style.name}>
                        {name}
                    </Text>
                    <Text
                        numberOfLines={1}
                        color={theme.colors.darkGrey}
                        style={style.detail}>
                        {detail}
                    </Text>
                </Column>
                {onPress && (
                    <SvgImage
                        name="ChevronRight"
                        size="sm"
                        color={theme.colors.primary}
                    />
                )}
            </Row>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        detail: {
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 18,
        },
        name: {
            fontSize: fediTheme.fontSizes.body,
            lineHeight: 20,
        },
        row: {
            backgroundColor: theme.colors.grey50,
            borderRadius: 14,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            width: '100%',
        },
    })
