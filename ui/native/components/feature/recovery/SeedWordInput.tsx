import { Text, Theme, useTheme } from '@rneui/themed'
import React, { PropsWithChildren, Ref, useState } from 'react'
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'

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
        const style = styles(theme)
        const testID = `SeedWordInput${number}`
        const isAndroid = Platform.OS === 'android'

        return (
            <Pressable
                style={style.wordContainer}
                onPress={() => {
                    if (typeof inputRef !== 'object' || !inputRef?.current)
                        return
                    inputRef.current.focus()
                }}>
                <Text style={style.wordNumber}>{`${number}`}</Text>
                <View
                    testID={isAndroid ? undefined : testID}
                    style={[
                        style.inputUnderline,
                        isFocused && style.inputUnderlineFocused,
                    ]}>
                    <TextInput
                        testID={isAndroid ? testID : undefined}
                        ref={inputRef as Ref<PropsWithChildren<TextInput>>}
                        value={word}
                        onChangeText={onInputUpdated}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        onSubmitEditing={selectNext}
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        // accessibilityLabel={`Seed word ${number}`}
                        // accessibilityHint="Enter the next word of your 12-word recovery phrase"
                        // importantForAccessibility="yes"
                        // TODO: these will need to be translated accessibility strings when we start working on accessibility specifically
                        style={[
                            style.input,
                            !(isFocused || valid) && style.invalidWord,
                        ]}
                    />
                </View>
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
        inputUnderline: {
            flex: 0.9,
            marginHorizontal: theme.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.extraLightGrey,
            minHeight: 24, // matches input minHeight to keep underline visible when empty
            justifyContent: 'center',
        },
        inputUnderlineFocused: {
            borderBottomColor: theme.colors.primary,
        },
        input: {
            fontSize: 16,
            minHeight: 24,
            padding: 0,
            color: theme.colors.black,
        },
        invalidWord: {
            color: theme.colors.red,
        },
    })

export default SeedWordInput
