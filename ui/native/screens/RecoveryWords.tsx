import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Card, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import type { SeedWords } from '@fedi/common/types'

import { fedimint } from '../bridge'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'RecoveryWords'>

type SeedWordProps = {
    number: number
    word: string
}

const SeedWord = ({ number, word }: SeedWordProps) => {
    const { theme } = useTheme()
    return (
        <View style={styles(theme).wordContainer}>
            <Text style={styles(theme).wordNumber}>{`${number}`}</Text>
            <Text
                style={styles(theme).wordText}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {word}
            </Text>
        </View>
    )
}

const RecoveryWords: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [seedWords, setSeedWords] = useState<SeedWords>([])

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

    return (
        <View style={styles(theme).container}>
            <ScrollView contentContainerStyle={styles(theme).scrollView}>
                <Text h2 h2Style={styles(theme).label}>
                    {t('feature.backup.recovery-words')}
                </Text>
                <Text style={styles(theme).instructionsText}>
                    {t('feature.backup.recovery-words-instructions')}
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
            </ScrollView>
            <Button
                title={t('words.continue')}
                containerStyle={styles(theme).continueButton}
                onPress={() => {
                    navigation.navigate('PersonalBackupSuccess')
                }}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'flex-start',
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
        seedWordsContainer: {
            flex: 1,
            alignItems: 'flex-start',
        },
        twoColumnContainer: {
            flexDirection: 'row',
        },
        wordContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
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
