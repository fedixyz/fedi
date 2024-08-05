import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet, View } from 'react-native'

import { setIsBackingUpBeforePin } from '@fedi/common/redux'

import { Images } from '../assets/images'
import { useAppDispatch } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'ResetPinStart'>

const ResetPinStart: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <View style={style.content}>
                <Image
                    resizeMode="contain"
                    source={Images.IllustrationPin}
                    style={style.emptyImage}
                />
                <Text h2>{t('feature.pin.recover-with-backup')}</Text>
                <Text style={style.backupNotice}>
                    {t('feature.pin.recovery-notice')}
                </Text>
            </View>
            <Button
                style={style.containerButton}
                onPress={() => {
                    dispatch(setIsBackingUpBeforePin(true))
                    navigation.navigate('ResetPin')
                }}>
                {t('words.continue')}
            </Button>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            padding: theme.spacing.xl,
        },
        content: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
        },
        emptyImage: {
            width: 200,
            height: 200,
            marginBottom: theme.spacing.lg,
        },
        backupNotice: {
            textAlign: 'center',
        },
        containerButton: {
            width: '100%',
            marginVertical: theme.spacing.md,
        },
    })

export default ResetPinStart
