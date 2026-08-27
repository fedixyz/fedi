import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Column, Row } from './Flex'
import { Pressable } from './Pressable'
import { SuccessPill } from './SuccessPill'
import SvgImage from './SvgImage'

export interface SelectableOptionCardProps {
    label: string
    isSelected: boolean
    onPress: () => void
    /** Green pill beside the label, e.g. "Recommended". */
    badge?: string
    /** Secondary line under the label. */
    description?: string
    /** Leading element — an avatar, logo or icon. */
    adornment?: React.ReactNode
    /** Trailing element rendered instead of the check, e.g. a balance. */
    action?: React.ReactNode
    disabled?: boolean
    testID?: string
}

/**
 * Bordered, single-select row.
 *
 * Matches the prototype's `.src-row`: white card, 16px radius, 14px padding,
 * a 14/500 name over a 12/400 meta line.
 */
export const SelectableOptionCard: React.FC<SelectableOptionCardProps> = ({
    label,
    isSelected,
    onPress,
    badge,
    description,
    adornment,
    action,
    disabled,
    testID,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Pressable
            testID={testID}
            disabled={disabled}
            onPress={onPress}
            containerStyle={[
                style.card,
                isSelected && style.cardSelected,
                disabled && style.cardDisabled,
            ]}>
            <Row align="center" gap="md" grow>
                {adornment}
                <Column gap="xxs" grow>
                    <Row align="center" gap="sm">
                        <Text style={style.name}>{label}</Text>
                        {badge && <SuccessPill label={badge} />}
                    </Row>
                    {description && (
                        <Text style={style.meta}>{description}</Text>
                    )}
                </Column>
                {action ?? (isSelected && <SvgImage name="Check" size="sm" />)}
            </Row>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.colors.white,
            borderColor: theme.colors.dividerGrey,
            borderRadius: 16,
            borderWidth: 1,
            padding: 14,
        },
        cardSelected: {
            borderColor: theme.colors.primary,
        },
        cardDisabled: {
            opacity: 0.5,
        },
        name: {
            color: theme.colors.primary,
            fontSize: 14,
            fontWeight: '500',
            lineHeight: 20,
        },
        meta: {
            color: theme.colors.darkGrey,
            fontSize: 12,
        },
    })
