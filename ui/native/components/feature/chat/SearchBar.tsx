import { type IconNode } from '@rneui/base'
import { Input, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleProp, StyleSheet, TextStyle, ViewStyle } from 'react-native'

import { PressableIcon } from '../../ui/PressableIcon'
import SvgImage from '../../ui/SvgImage'

type Props = {
    placeholder?: string
    autoFocus?: boolean
    leftIcon?: IconNode
    rightIcon?: IconNode
    query?: string
    setQuery?: (query: string) => void
    clearSearch?: () => void
    textStyle?: StyleProp<TextStyle>
    containerStyle?: StyleProp<ViewStyle>
    inputContainerStyle?: StyleProp<ViewStyle>
}

const SearchBar: React.FC<Props> = ({
    placeholder,
    autoFocus = true,
    leftIcon = <SvgImage name="Search" size={20} />,
    rightIcon,
    query = '',
    setQuery,
    clearSearch,
    textStyle,
    inputContainerStyle,
    containerStyle,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Input
            containerStyle={[style.container, containerStyle]}
            maxFontSizeMultiplier={1.2}
            inputContainerStyle={[style.inputContainer, inputContainerStyle]}
            style={[style.input, textStyle]}
            leftIcon={leftIcon}
            rightIcon={
                rightIcon ??
                (query.length > 0 && (
                    <PressableIcon
                        onPress={clearSearch}
                        svgName="Close"
                        svgProps={{ size: 20 }}
                    />
                ))
            }
            value={query}
            placeholder={placeholder}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoFocus={autoFocus}
            autoCorrect={false}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1.5,
            borderRadius: 8,
            paddingVertical: 0,
            marginVertical: 0,
            height: 36,
        },
        inputContainer: {
            height: '100%',
            width: '100%',
            borderBottomWidth: 0,
        },
        input: {
            height: '100%',
            width: '100%',
            marginTop: theme.spacing.xs,
            fontSize: 14,
        },
    })

export default SearchBar
