import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import SelectRecoveryFileButton from '../components/feature/recovery/SelectRecoveryFileButton'
import HoloCard from '../components/ui/HoloCard'
import LineBreak from '../components/ui/LineBreak'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'LocateSocialRecovery'
>

const LocateSocialRecovery: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    return (
        <View style={styles(theme).container}>
            <Text style={styles(theme).instructionsText}>
                {t('feature.recovery.social-recovery-instructions')}
            </Text>
            <HoloCard
                iconImage={<SvgImage name="FediFile" />}
                title={t('feature.recovery.locate-social-recovery-file')}
                body={
                    <>
                        <View style={styles(theme).textContainer}>
                            <Text>
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-1',
                                )}
                            </Text>
                            <Text>
                                {'  \u2022 '}
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-check-1',
                                )}
                            </Text>
                            <Text>
                                {'  \u2022 '}
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-check-2',
                                )}
                            </Text>
                            <Text>
                                {'  \u2022 '}
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-check-3',
                                )}
                            </Text>
                            <Text>
                                {'  \u2022 '}
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-check-4',
                                )}
                            </Text>
                            <LineBreak />
                            <Text>
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-3',
                                )}
                            </Text>
                            <Text bold>backup.fedi</Text>
                            <LineBreak />
                        </View>
                        <SelectRecoveryFileButton />
                    </>
                }
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
            paddingHorizontal: theme.spacing.xl,
        },
        instructionsText: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.md,
            marginVertical: theme.spacing.lg,
        },
        textContainer: {
            width: '100%',
        },
    })

export default LocateSocialRecovery
