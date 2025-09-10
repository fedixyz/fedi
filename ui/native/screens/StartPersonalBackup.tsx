import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import Flex from '../components/ui/Flex'
import HoloGuidance from '../components/ui/HoloGuidance'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StartPersonalBackup'
>

const StartPersonalBackup: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    return (
        <SafeAreaContainer edges="bottom">
            <Flex grow center style={styles(theme).container}>
                <HoloGuidance
                    iconImage={
                        <SvgImage name="WordList" size={SvgImageSize.lg} />
                    }
                    title={t('feature.backup.personal-backup')}
                    message={t(
                        'feature.backup.start-personal-backup-instructions',
                    )}
                />
                <Button
                    title={t('words.continue')}
                    containerStyle={styles(theme).continueButton}
                    onPress={() => {
                        navigation.navigate('RecoveryWords')
                    }}
                />
            </Flex>
        </SafeAreaContainer>
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

export default StartPersonalBackup
