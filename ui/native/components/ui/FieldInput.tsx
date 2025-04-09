import { Input, InputProps, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

type Props = InputProps

export const FieldInput: React.FC<Props> = ({ ...props }) => {
    const { theme } = useTheme()
    const [focused, setFocused] = React.useState(false)

    const style = styles(theme)

    return (
        <Input
            containerStyle={style.container}
            inputContainerStyle={[
                style.inputContainer,
                props.disabled
                    ? style.inputContainerDisabled
                    : focused
                      ? style.inputContainerFocused
                      : null,
            ]}
            inputStyle={[
                style.inputStyle,
                props.disabled && style.inputDisabled,
            ]}
            errorStyle={
                props.errorMessage ? style.errorMessage : style.errorHidden
            }
            labelStyle={style.labelStyle}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            {...props}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            height: 'auto',
            paddingHorizontal: 0,
        },
        inputContainer: {
            borderWidth: 1.5,
            // borderBottomWidth was initially set to 1, overriding borderWidth
            borderBottomWidth: 1.5,
            borderColor: theme.colors.lightGrey,
            borderRadius: 8,
            overflow: 'hidden',
        },
        inputContainerFocused: {
            borderColor: theme.colors.primary,
        },
        inputContainerDisabled: {
            borderColor: theme.colors.extraLightGrey,
        },
        inputStyle: {
            paddingHorizontal: 12,
            paddingVertical: 14,
            height: '100%',
            lineHeight: 20,
            fontSize: fediTheme.fontSizes.body,
            color: theme.colors.night,
            fontFamily: 'AlbertSans-Regular',
            fontWeight: fediTheme.fontWeights.normal,
        },
        inputDisabled: {
            backgroundColor: theme.colors.lightGrey,
        },
        labelStyle: {
            fontSize: fediTheme.fontSizes.small,
            fontWeight: fediTheme.fontWeights.normal,
            fontFamily: 'AlbertSans-Regular',
            color: theme.colors.night,
            marginLeft: 8,
            marginBottom: 4,
        },
        errorHidden: {
            display: 'none',
        },
        errorMessage: {
            marginLeft: 8,
            marginTop: 4,
            marginBottom: 0,
            display: 'flex',
        },
    })
