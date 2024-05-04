import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import HoloCard from '../components/ui/HoloCard'
import LineBreak from '../components/ui/LineBreak'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StartRecoveryAssist'
>

const StartRecoveryAssist: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    return (
        <View style={styles(theme).container}>
            <Text style={styles(theme).instructionsText}>
                {t('feature.recovery.recovery-assist-description')}
            </Text>
            <HoloCard
                iconImage={<SvgImage name="SocialPeople" />}
                title={t('feature.recovery.recovery-assist-process')}
                body={
                    <>
                        <View style={styles(theme).textContainer}>
                            <Text>
                                {t(
                                    'feature.recovery.recovery-assist-instructions-1',
                                )}
                            </Text>
                            <LineBreak />
                            <Text>
                                {t(
                                    'feature.recovery.recovery-assist-instructions-2',
                                )}
                            </Text>
                            <LineBreak />
                            <Text>
                                {t(
                                    'feature.recovery.recovery-assist-instructions-3',
                                )}
                            </Text>
                            <LineBreak />
                            <Text>
                                {t(
                                    'feature.recovery.recovery-assist-instructions-4',
                                )}
                            </Text>
                            <LineBreak />
                            <Text>
                                {t(
                                    'feature.recovery.recovery-assist-instructions-5',
                                )}
                            </Text>
                            <LineBreak />
                        </View>
                    </>
                }
            />
            <Button
                title={t('words.continue')}
                containerStyle={styles(theme).continueButton}
                onPress={() => {
                    navigation.navigate('ConfirmRecoveryAssist')
                }}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: theme.spacing.xl,
        },
        continueButton: {
            width: '100%',
            marginTop: 'auto',
        },
        instructionsText: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.xl,
            marginBottom: theme.spacing.md,
            fontWeight: '400',
        },
        textContainer: {
            width: '100%',
        },
    })

export default StartRecoveryAssist
