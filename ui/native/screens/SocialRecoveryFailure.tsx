import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, ImageBackground, StyleSheet, View } from 'react-native'

import { Images } from '../assets/images'
import SvgImage from '../components/ui/SvgImage'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SocialRecoveryFailure'
>

const SocialRecoveryFailure: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    return (
        <ImageBackground
            source={Images.HoloBackground}
            style={styles(theme).container}>
            <View style={styles(theme).detailsContainer}>
                <SvgImage name="Error" />
                <Text h2 h2Style={styles(theme).failureMessage}>
                    {t('feature.recovery.social-recovery-unsuccessful')}
                </Text>
                <Text style={styles(theme).failureDetails}>
                    {t(
                        'feature.recovery.social-recovery-unsuccessful-instructions',
                    )}
                </Text>
            </View>
            <View style={styles(theme).buttonContainer}>
                <Button
                    type="clear"
                    title={t('phrases.back-to-app')}
                    containerStyle={styles(theme).backToAppButton}
                    onPress={() => {
                        navigation.dispatch(reset('TabsNavigator'))
                    }}
                />
                <Button
                    title={t('feature.recovery.try-social-recovery-again')}
                    onPress={() => {
                        navigation.dispatch(reset('LocateSocialRecovery'))
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
            justifyContent: 'center',
        },
        detailsContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 'auto',
            paddingHorizontal: theme.spacing.xl,
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
        iconImage: {
            height: theme.sizes.sm,
            width: theme.sizes.sm,
        },
        failureMessage: {
            textAlign: 'center',
            marginVertical: theme.spacing.md,
        },
        failureDetails: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.md,
        },
        backToAppButton: {
            marginBottom: theme.spacing.md,
        },
        buttonContainer: {
            width: '90%',
            marginTop: 'auto',
            marginBottom: 50,
            flexDirection: 'column',
            justifyContent: 'flex-end',
        },
    })

export default SocialRecoveryFailure
