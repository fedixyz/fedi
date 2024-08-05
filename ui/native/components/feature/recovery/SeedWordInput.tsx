import { Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { PropsWithChildren, Ref, useState } from 'react'
import { Pressable, StyleSheet, TextInput } from 'react-native'

import { BIP39_WORD_LIST } from '@fedi/common/constants/bip39'

const isValidSeedWord = (word: string) => {
    return word.length > 0 && BIP39_WORD_LIST.indexOf(word.toLowerCase()) >= 0
}

type SeedWordInputProps = {
    number: number
    word: string
    onInputUpdated: (value: string) => void
    selectNext: () => void
}

export const SeedWordInput = React.forwardRef<TextInput, SeedWordInputProps>(
    ({ number, word, onInputUpdated, selectNext }, inputRef) => {
        const { theme } = useTheme()
        const [isFocused, setIsFocused] = useState(false)
        const valid = isValidSeedWord(word)

        return (
            <Pressable
                style={styles(theme).wordContainer}
                onPress={() => {
                    if (typeof inputRef !== 'object' || !inputRef?.current)
                        return

                    inputRef.current.focus()
                }}>
                <Text style={styles(theme).wordNumber}>{`${number}`}</Text>
                <Input
                    ref={inputRef as Ref<PropsWithChildren<TextInput>>}
                    value={word}
                    onChangeText={onInputUpdated}
                    autoCorrect={false}
                    containerStyle={styles(theme).wordInputOuterContainer}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    inputContainerStyle={[
                        styles(theme).wordInputInnerContainer,
                        isFocused
                            ? styles(theme).focusedInputInnerContainer
                            : {},
                    ]}
                    inputStyle={[
                        styles(theme).wordInput,
                        isFocused ? styles(theme).focusedInput : {},
                        !(isFocused || valid) ? styles(theme).invalidWord : {},
                    ]}
                    autoCapitalize={'none'}
                    returnKeyType={'next'}
                    onSubmitEditing={selectNext}
                    blurOnSubmit={false}
                />
            </Pressable>
        )
    },
)

const styles = (theme: Theme) =>
    StyleSheet.create({
        wordContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginVertical: 8,
        },
        wordNumber: {
            color: theme.colors.black,
            paddingLeft: 0,
            width: '20%',
            textAlign: 'center',
        },
        wordInputOuterContainer: {
            width: '75%',
            height: 24,
            flexDirection: 'row',
            alignItems: 'center',
        },
        wordInputInnerContainer: {
            borderBottomColor: theme.colors.extraLightGrey,
            minHeight: 24,
        },
        wordInput: {
            fontSize: 16,
            minHeight: 24,
            padding: 0,
        },
        focusedInputInnerContainer: {
            borderBottomColor: theme.colors.primary,
        },
        focusedInput: {
            marginBottom: 0,
        },
        invalidWord: {
            color: 'red',
        },
    })

export default SeedWordInput
