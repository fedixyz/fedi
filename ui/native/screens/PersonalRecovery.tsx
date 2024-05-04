import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Card, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Keyboard,
    KeyboardEvent,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { recoverFromMnemonic, selectActiveFederation } from '@fedi/common/redux'
import type { SeedWords } from '@fedi/common/types'
import stringUtils from '@fedi/common/utils/StringUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import { BIP39_WORD_LIST } from '../constants'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetAfterPersonalRecovery } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('SeedWordInput')

const isValidSeedWord = (word: string) => {
    return word.length > 0 && BIP39_WORD_LIST.indexOf(word.toLowerCase()) >= 0
}

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PersonalRecovery'
>

type SeedWordInputProps = {
    number: number
    word: string
    onInputUpdated: (value: string) => void
    selectNext: () => void
}

const SeedWordInput = React.forwardRef<TextInput, SeedWordInputProps>(
    ({ number, word, onInputUpdated, selectNext }, ref) => {
        const { theme } = useTheme()
        const [isFocused, setIsFocused] = useState(false)
        const valid = isValidSeedWord(word)

        return (
            <Pressable
                style={styles(theme).wordContainer}
                onPress={() => {
                    if (typeof ref !== 'object' || !ref?.current) return

                    ref.current.focus()
                }}>
                <Text style={styles(theme).wordNumber}>{`${number}`}</Text>
                <Input
                    ref={ref}
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

const PersonalRecovery: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const dispatch = useAppDispatch()
    const [recoveryInProgress, setRecoveryInProgress] = useState<boolean>(false)
    const [seedWords, setSeedWords] = useState<SeedWords>(
        new Array(12).fill(''),
    )
    const inputRefs = useRef<Array<TextInput | null>>([])
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0)

    const activeFederationId = activeFederation?.id

    useEffect(() => {
        const keyboardShownListener = Keyboard.addListener(
            'keyboardDidShow',
            (e: KeyboardEvent) => {
                setKeyboardHeight(e.endCoordinates.height)
            },
        )
        const keyboardHiddenListener = Keyboard.addListener(
            'keyboardDidHide',
            () => {
                setKeyboardHeight(0)
            },
        )

        return () => {
            keyboardShownListener.remove()
            keyboardHiddenListener.remove()
        }
    }, [])

    useEffect(() => {
        const recoverFromSeed = async () => {
            try {
                await dispatch(
                    recoverFromMnemonic({
                        fedimint,
                        mnemonic: seedWords,
                    }),
                ).unwrap()
                setRecoveryInProgress(false)
                navigation.dispatch(resetAfterPersonalRecovery())
            } catch (error) {
                log.error('recoverFromSeed', error)
                toast.show({
                    content: t('errors.recovery-failed'),
                    status: 'error',
                })
            }
        }

        if (recoveryInProgress) {
            recoverFromSeed()
        }
    }, [
        activeFederationId,
        dispatch,
        navigation,
        recoveryInProgress,
        seedWords,
        toast,
        t,
    ])

    const handleInputUpdate = (inputValue: string, index: number) => {
        const validatedInput = stringUtils.keepOnlyLowercaseLetters(inputValue)

        setSeedWords([
            ...seedWords.slice(0, index),
            validatedInput,
            ...seedWords.slice(index + 1),
        ])
    }

    const renderFirstSixSeedWords = () => {
        return seedWords.slice(0, 6).map((s, i) => (
            <SeedWordInput
                key={`sw-f6-${i}`}
                number={i + 1}
                word={s}
                onInputUpdated={value => handleInputUpdate(value, i)}
                selectNext={() => {
                    inputRefs.current[i + 1]?.focus()
                }}
                ref={el => {
                    inputRefs.current[i] = el
                }}
            />
        ))
    }

    const renderLastSixSeedWords = () => {
        return seedWords.slice(-6).map((s, i) => (
            <SeedWordInput
                key={`sw-l6-${i}`}
                number={i + 7}
                word={s}
                onInputUpdated={value => handleInputUpdate(value, i + 6)}
                selectNext={() => {
                    inputRefs.current[i + 7]?.focus()
                }}
                ref={el => {
                    inputRefs.current[i + 6] = el
                }}
            />
        ))
    }

    return (
        <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
                styles(theme).container,
                keyboardHeight > 0 && Platform.OS === 'ios'
                    ? { paddingBottom: keyboardHeight + theme.spacing.xl }
                    : {},
            ]}>
            <Text style={styles(theme).instructionsText}>
                {t('feature.recovery.personal-recovery-instructions')}
            </Text>
            <Card containerStyle={styles(theme).roundedCardContainer}>
                <View style={styles(theme).twoColumnContainer}>
                    <View style={styles(theme).seedWordsContainer}>
                        {renderFirstSixSeedWords()}
                    </View>
                    <View style={styles(theme).seedWordsContainer}>
                        {renderLastSixSeedWords()}
                    </View>
                </View>
            </Card>
            <Button
                title={t('feature.recovery.recover-wallet')}
                containerStyle={styles(theme).continueButton}
                // TODO: separate loading screen as per designs
                onPress={() => setRecoveryInProgress(true)}
                loading={recoveryInProgress}
                disabled={
                    recoveryInProgress ||
                    seedWords.some(s => !isValidSeedWord(s))
                }
            />
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'flex-start',
            padding: theme.spacing.xl,
        },
        continueButton: {
            width: '100%',
            marginTop: theme.spacing.xl,
        },
        instructionsText: {
            textAlign: 'left',
        },
        roundedCardContainer: {
            borderRadius: theme.borders.defaultRadius,
            width: '100%',
            marginHorizontal: 0,
            padding: theme.spacing.lg,
        },
        seedWordsContainer: {
            flex: 1,
            alignItems: 'flex-start',
        },
        twoColumnContainer: {
            flexDirection: 'row',
        },
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

export default PersonalRecovery
