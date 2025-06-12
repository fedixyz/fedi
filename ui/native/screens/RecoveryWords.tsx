import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Card, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'

import { useNuxStep } from '@fedi/common/hooks/nux'
import {
    selectIsRecoveringBeforePin,
    setIsBackingUpBeforePin,
} from '@fedi/common/redux'
import type { SeedWords } from '@fedi/common/types'

import { fedimint } from '../bridge'
import Flex from '../components/ui/Flex'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'RecoveryWords'>

type SeedWordProps = {
    number: number
    word: string
}

const SeedWord = ({ number, word }: SeedWordProps) => {
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <Flex row justify="between" style={style.wordContainer}>
            <Text style={style.wordNumber}>{`${number}`}</Text>
            <Text style={style.wordText} numberOfLines={1} adjustsFontSizeToFit>
                {word}
            </Text>
        </Flex>
    )
}

const RecoveryWords: React.FC<Props> = ({ navigation, route }: Props) => {
    const { nextScreenParams } = route.params || {}
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [seedWords, setSeedWords] = useState<SeedWords>([])

    const [hasPerformedPersonalBackup, completePersonalBackup] = useNuxStep(
        'hasPerformedPersonalBackup',
    )

    const isBackingUpBeforePin = useAppSelector(selectIsRecoveringBeforePin)
    const dispatch = useAppDispatch()

    useEffect(() => {
        const getMnemonicWrapper = async () => {
            const seed = await fedimint.getMnemonic()
            setSeedWords(seed)
        }

        getMnemonicWrapper()
    }, [])

    const renderFirstSixSeedWords = () => {
        return seedWords
            .slice(0, 6)
            .map((s, i) => (
                <SeedWord key={`sw-f6-${i}`} number={i + 1} word={s} />
            ))
    }
    const renderLastSixSeedWords = () => {
        return seedWords
            .slice(-6)
            .map((s, i) => (
                <SeedWord key={`sw-l6-${i}`} number={i + 7} word={s} />
            ))
    }

    const handleContinueOrDone = () => {
        if (nextScreenParams) {
            return navigation.navigate(...nextScreenParams)
        }

        if (hasPerformedPersonalBackup) {
            return navigation.navigate('Settings')
        }

        completePersonalBackup()

        if (isBackingUpBeforePin) {
            dispatch(setIsBackingUpBeforePin(false))
            return navigation.navigate('SetPin')
        }

        navigation.navigate('TabsNavigator')
    }

    const style = styles(theme)

    return (
        <Flex grow align="start" style={style.container}>
            <ScrollView contentContainerStyle={style.scrollView}>
                <Text h2 h2Style={style.label}>
                    {t('feature.backup.recovery-words')}
                </Text>
                <Text style={style.instructionsText}>
                    {t('feature.backup.recovery-words-instructions')}
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
            </ScrollView>
            <Button
                title={t('words.done')}
                containerStyle={style.continueButton}
                onPress={handleContinueOrDone}
            />
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.xl,
        },
        scrollView: {
            paddingBottom: theme.spacing.lg,
        },
        continueButton: {
            width: '100%',
            marginBottom: theme.spacing.md,
            marginTop: 'auto',
        },
        instructionsText: {
            textAlign: 'left',
            fontWeight: '400',
        },
        label: {
            marginVertical: theme.spacing.md,
        },
        roundedCardContainer: {
            borderRadius: theme.borders.defaultRadius,
            width: '100%',
            marginHorizontal: 0,
            padding: theme.spacing.xl,
        },
        wordContainer: {
            marginVertical: theme.spacing.sm,
        },
        wordNumber: {
            flexShrink: 0,
            color: theme.colors.black,
            paddingHorizontal: theme.spacing.md,
            minWidth: 40,
        },
        wordText: {
            flex: 1,
            textAlign: 'left',
            fontWeight: '400',
        },
    })

export default RecoveryWords
