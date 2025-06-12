import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, ImageBackground, StyleSheet } from 'react-native'

import { Images } from '../assets/images'
import SelectRecoveryFileButton from '../components/feature/recovery/SelectRecoveryFileButton'
import Flex from '../components/ui/Flex'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SelectRecoveryFileFailure'
>

const SelectRecoveryFileFailure: React.FC<Props> = ({
    navigation,
    route,
}: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { fileName } = route.params

    const style = styles(theme)

    return (
        <ImageBackground source={Images.HoloBackground} style={style.container}>
            <Flex center style={style.detailsContainer}>
                <SvgImage name="Error" />
                <Text h2 h2Style={style.failureMessage}>
                    {t('feature.recovery.opening-backup-file-failed')}
                </Text>
                <Text style={style.failureDetails}>
                    {t(
                        'feature.recovery.opening-backup-file-failed-instructions',
                        { fileName },
                    )}
                </Text>
            </Flex>
            <Flex justify="end" style={style.buttonContainer}>
                <Button
                    type="clear"
                    title={t('phrases.back-to-app')}
                    containerStyle={style.backToAppButton}
                    onPress={() => {
                        navigation.replace('TabsNavigator')
                    }}
                />
                <SelectRecoveryFileButton />
            </Flex>
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
            marginBottom: theme.spacing.xl,
        },
    })

export default SelectRecoveryFileFailure
