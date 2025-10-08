import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import Flex from '../components/ui/Flex'
import HoloGuidance from '../components/ui/HoloGuidance'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StartSocialBackup'
>

const StartSocialBackup: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { federationId } = route.params

    return (
        <Flex grow center style={styles(theme).container}>
            <HoloGuidance
                iconImage={
                    <>
                        <SvgImage name="Profile" size={SvgImageSize.md} />
                        <SvgImage name="ArrowRight" size={SvgImageSize.md} />
                        <SvgImage name="FediFile" size={SvgImageSize.md} />
                    </>
                }
                title={t('feature.backup.social-backup')}
                message={t('feature.backup.start-social-backup-instructions')}
            />
            <Button
                title={t('words.next')}
                containerStyle={styles(theme).continueButton}
                onPress={() => {
                    navigation.navigate('RecordBackupVideo', { federationId })
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
            marginVertical: theme.spacing.md,
        },
    })

export default StartSocialBackup
