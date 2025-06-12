import { Text, Theme, useTheme } from '@rneui/themed'
import React, { RefObject } from 'react'
import { Pressable, StyleSheet, TextInput } from 'react-native'

export type Props = {
    value: string
    onChangeText: (_: string) => void
    inputRef: RefObject<TextInput>
    readOnly?: boolean
    label?: string
}

// The Input/TextInput component can be difficult to customize for some UI
// so this component makes it convenient to use the state functionality while
// hiding the default UI and display a simple label + value instead
const InvisibleInput: React.FC<Props> = ({
    value,
    onChangeText,
    inputRef,
    readOnly,
    label = '',
}) => {
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <Pressable disabled={readOnly}>
            <Pressable
                style={style.interactionContainer}
                disabled={readOnly}
                onPress={() => inputRef.current?.focus()}>
                <Text h1 numberOfLines={1}>
                    {value}
                </Text>
                <Text h2 numberOfLines={1} h2Style={style.labelText}>
                    {label}
                </Text>
            </Pressable>
            <TextInput
                ref={inputRef}
                autoFocus={!readOnly}
                onChangeText={onChangeText}
                value={value}
                keyboardType="numeric"
                returnKeyType="done"
                maxLength={17}
                style={style.invisible}
            />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        interactionContainer: {
            marginTop: 'auto',
            flexDirection: 'row',
            alignItems: 'flex-end',
            marginHorizontal: theme.spacing.lg,
            width: '100%',
        },
        invisible: {
            opacity: 0,
            width: 0,
            height: 0,
            position: 'absolute',
        },
        labelText: {
            marginLeft: theme.spacing.sm,
            marginBottom: 3,
            fontSize: 20,
        },
    })

export default InvisibleInput
