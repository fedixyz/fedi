import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, StyleSheet, View } from 'react-native'

import HoloGuidance from '../components/ui/HoloGuidance'
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
        <View style={styles(theme).container}>
            <HoloGuidance
                iconImage={<SvgImage name="WordList" size={SvgImageSize.lg} />}
                title={t('feature.backup.personal-backup')}
                message={t('feature.backup.start-personal-backup-instructions')}
            />
            <Button
                title={t('words.continue')}
                containerStyle={styles(theme).continueButton}
                onPress={() => {
                    navigation.navigate('RecoveryWords')
                }}
            />
        </View>
    )
}

const WINDOW_WIDTH = Dimensions.get('window').width
const CIRCLE_SIZE = WINDOW_WIDTH * 0.45

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
        },
        label: {
            textAlign: 'center',
            marginVertical: theme.spacing.lg,
        },
        instructionsText: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.xl,
        },
        holoCircle: {
            height: CIRCLE_SIZE,
            width: CIRCLE_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
        },
        circleBorder: {
            borderRadius: CIRCLE_SIZE * 0.5,
        },
        holoIconImage: {
            height: theme.sizes.lg,
            width: theme.sizes.lg,
        },
        continueButton: {
            width: '100%',
            marginVertical: theme.spacing.md,
        },
    })

export default StartPersonalBackup
