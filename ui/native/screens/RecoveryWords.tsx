import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Card, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageBackground, ScrollView, StyleSheet, View } from 'react-native'

import { useNuxStep } from '@fedi/common/hooks/nux'
import {
    selectIsRecoveringBeforePin,
    setIsBackingUpBeforePin,
} from '@fedi/common/redux'
import type { SeedWords } from '@fedi/common/types'

import { Images } from '../assets/images'
import { fedimint } from '../bridge'
import Flex, { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
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

        navigation.dispatch(reset('Settings'))
    }

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="bottom">
            <Flex style={style.container}>
                <ScrollView style={style.content}>
                    <Column align="center" gap="md" grow style={style.content}>
                        <ImageBackground
                            source={Images.HoloBackground}
                            style={style.iconBackground}>
                            <SvgImage name="WordList" size={SvgImageSize.lg} />
                        </ImageBackground>
                        <Text
                            style={style.title}
                            numberOfLines={1}
                            adjustsFontSizeToFit>
                            {t('feature.backup.personal-backup-title')}
                        </Text>
                        <Text
                            style={style.instructionsText}
                            numberOfLines={3}
                            adjustsFontSizeToFit>
                            {t('feature.backup.personal-backup-description')}
                        </Text>
                        <Column style={style.warning}>
                            <Row center>
                                <View style={style.warningIconWrapper}>
                                    <SvgImage
                                        name="Warning"
                                        size={SvgImageSize.xs}
                                    />
                                </View>
                                <Text
                                    style={style.warningText}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit>
                                    {t(
                                        'feature.backup.personal-backup-warning-line-1',
                                    )}
                                </Text>
                            </Row>

                            <Text style={style.warningText}>
                                {t(
                                    'feature.backup.personal-backup-warning-line-2',
                                )}
                            </Text>
                        </Column>
                        <Text style={style.tipText}>
                            {t('feature.backup.personal-backup-words-tip')}
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
                    </Column>
                </ScrollView>
                <Column gap="md" fullWidth style={style.buttons}>
                    <Button
                        testID="ContinueButton"
                        title={t(
                            'feature.backup.personal-backup-button-primary-text',
                        )}
                        onPress={handleContinueOrDone}
                    />
                </Column>
            </Flex>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        scrollView: {},
        content: {
            padding: theme.spacing.lg,
        },
        iconBackground: {
            alignItems: 'center',
            borderRadius: 1024,
            display: 'flex',
            flexDirection: 'row',
            height: 80,
            justifyContent: 'center',
            overflow: 'hidden',
            width: 80,
        },
        title: {
            fontSize: 24,
            fontWeight: '600',
        },
        instructionsText: {
            color: theme.colors.darkGrey,
            fontWeight: '400',
            textAlign: 'center',
        },
        warning: {
            backgroundColor: theme.colors.orange100,
            borderRadius: 6,
            padding: theme.spacing.md,
            width: '100%',
        },
        warningText: {
            color: theme.colors.black,
            fontSize: 14,
            textAlign: 'center',
        },
        warningIconWrapper: {
            marginRight: theme.spacing.sm,
        },
        tipText: {
            fontWeight: '700',
            textAlign: 'center',
        },
        roundedCardContainer: {
            borderRadius: theme.borders.defaultRadius,
            margin: 0,
            padding: theme.spacing.lg,
            width: '100%',
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
        buttons: {
            padding: theme.spacing.xl,
        },
    })

export default RecoveryWords
