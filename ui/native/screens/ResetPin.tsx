import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Card, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Keyboard,
    KeyboardEvent,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import type { SeedWords } from '@fedi/common/types'
import stringUtils from '@fedi/common/utils/StringUtils'

import { fedimint } from '../bridge'
import SeedWordInput from '../components/feature/recovery/SeedWordInput'
import { BIP39_WORD_LIST } from '../constants'
import { usePinContext } from '../state/contexts/PinContext'
import type { RootStackParamList } from '../types/navigation'

const isValidSeedWord = (word: string) => {
    return word.length > 0 && BIP39_WORD_LIST.indexOf(word.toLowerCase()) >= 0
}

export type Props = NativeStackScreenProps<RootStackParamList, 'ResetPin'>

const ResetPin: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const pin = usePinContext()
    const [seedWords, setSeedWords] = useState<SeedWords>(
        new Array(12).fill(''),
    )
    const inputRefs = useRef<Array<TextInput | null>>([])
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0)
    const toast = useToast()

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

    const handleResetPin = useCallback(async () => {
        if (pin.status !== 'set') return

        const areSeedWordsCorrect = await fedimint.checkMnemonic(seedWords)

        if (!areSeedWordsCorrect) {
            toast.show({
                status: 'error',
                content: t('errors.recovery-failed'),
            })
            return
        }

        await pin.unset()

        navigation.navigate('SetPin')
    }, [navigation, seedWords, pin, toast, t])

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
                onPress={handleResetPin}
                disabled={seedWords.some(s => !isValidSeedWord(s))}
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
    })

export default ResetPin