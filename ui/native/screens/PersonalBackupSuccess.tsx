import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, ImageBackground, StyleSheet, View } from 'react-native'

import { Images } from '../assets/images'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PersonalBackupSuccess'
>

const PersonalBackupSuccess: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    return (
        <ImageBackground
            source={Images.HoloBackground}
            style={styles(theme).container}>
            <View style={styles(theme).detailsContainer}>
                <SvgImage name="Check" containerStyle={styles(theme).icon} />
                <Text h2 h2Style={styles(theme).successMessage}>
                    {t('feature.backup.backed-up-recovery-words')}
                </Text>
            </View>
            <View style={styles(theme).buttonContainer}>
                <Button
                    title={t('words.done')}
                    onPress={() => {
                        navigation.navigate('TabsNavigator')
                    }}
                />
            </View>
        </ImageBackground>
    )
}

const WINDOW_WIDTH = Dimensions.get('window').width
const CIRCLE_SIZE = WINDOW_WIDTH * 0.85

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-end',
        },
        detailsContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.secondary,
            // for a perfect circle borderRadius should be half of
            // height and width
            height: CIRCLE_SIZE,
            width: CIRCLE_SIZE,
            borderRadius: CIRCLE_SIZE * 0.5,
            shadowRadius: 1,
            shadowOffset: {
                width: 0,
                height: 2,
            },
            elevation: 1,
            shadowColor: theme.colors.primaryLight,
        },
        icon: {
            marginVertical: theme.spacing.md,
        },
        successMessage: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.xl,
        },
        buttonContainer: {
            width: '90%',
            height: '30%',
            marginBottom: 50,
            flexDirection: 'column',
            justifyContent: 'flex-end',
        },
    })

export default PersonalBackupSuccess
