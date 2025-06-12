import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import Flex from '../components/ui/Flex'
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

    const style = styles(theme)

    return (
        <Flex grow align="center" justify="start" style={style.container}>
            <Text style={style.instructionsText}>
                {t('feature.recovery.recovery-assist-description')}
            </Text>
            <HoloCard
                iconImage={<SvgImage name="SocialPeople" />}
                title={t('feature.recovery.recovery-assist-process')}
                body={
                    <>
                        <Flex fullWidth>
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
                        </Flex>
                    </>
                }
            />
            <Button
                title={t('words.continue')}
                containerStyle={style.continueButton}
                onPress={() => {
                    navigation.navigate('ConfirmRecoveryAssist')
                }}
            />
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
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
    })

export default StartRecoveryAssist
