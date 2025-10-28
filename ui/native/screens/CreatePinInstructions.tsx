import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet } from 'react-native'

import { setIsBackingUpBeforePin } from '@fedi/common/redux'

import { Images } from '../assets/images'
import Flex from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'CreatePinInstructions'
>

const CreatePinInstructions: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()

    const style = styles(theme)

    return (
        <SafeAreaContainer edges={'bottom'}>
            <Flex grow style={style.container}>
                <Flex center grow gap="sm">
                    <Image
                        resizeMode="contain"
                        source={Images.IllustrationPin}
                        style={style.emptyImage}
                    />
                    <Text h2>{t('feature.pin.back-up-your-account')}</Text>
                    <Text style={style.backupNotice}>
                        {t('feature.pin.backup-notice')}
                    </Text>
                </Flex>
                <Button
                    containerStyle={style.containerButton}
                    title={t('words.continue')}
                    onPress={() => {
                        dispatch(setIsBackingUpBeforePin(true))
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

export default CreatePinInstructions
