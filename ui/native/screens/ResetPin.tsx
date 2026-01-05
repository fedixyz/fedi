import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Card, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, ScrollView, StyleSheet, TextInput } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import type { SeedWords } from '@fedi/common/types'
import stringUtils from '@fedi/common/utils/StringUtils'

import SeedWordInput from '../components/feature/recovery/SeedWordInput'
import Flex from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { BIP39_WORD_LIST } from '../constants'
import { usePinContext } from '../state/contexts/PinContext'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'
import { useKeyboard } from '../utils/hooks/keyboard'

const isValidSeedWord = (word: string) => {
    return word.length > 0 && BIP39_WORD_LIST.indexOf(word.toLowerCase()) >= 0
}

export type Props = NativeStackScreenProps<RootStackParamList, 'ResetPin'>

const ResetPin: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const fedimint = useFedimint()
    const pin = usePinContext()
    const [seedWords, setSeedWords] = useState<SeedWords>(
        new Array(12).fill(''),
    )
    const inputRefs = useRef<Array<TextInput | null>>([])
    const { height: keyboardHeight } = useKeyboard()
    const toast = useToast()

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

        navigation.dispatch(reset('SetPin'))
    }, [navigation, seedWords, pin, toast, t, fedimint])

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

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="bottom">
            <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[
                    style.container,
                    keyboardHeight > 0 && Platform.OS === 'ios'
                        ? { paddingBottom: keyboardHeight + theme.spacing.xl }
                        : {},
                ]}>
                <Text style={style.instructionsText}>
                    {t('feature.recovery.personal-recovery-instructions')}
                </Text>
                <Card containerStyle={style.roundedCardContainer}>
                    <Flex row>
                        <Flex grow basis={false} align="start">
                            {renderFirstSixSeedWords()}
                        </Flex>
                        <Flex grow basis={false} align="start">
                            {renderLastSixSeedWords()}
                        </Flex>
                    </Flex>
                </Card>
                <Button
                    title={t('feature.recovery.recover-wallet')}
                    containerStyle={style.continueButton}
                    onPress={handleResetPin}
                    disabled={seedWords.some(s => !isValidSeedWord(s))}
                />
            </ScrollView>
        </SafeAreaContainer>
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
    })

export default ResetPin
