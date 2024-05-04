import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dimensions,
    ImageBackground,
    ImageSourcePropType,
    StyleSheet,
    View,
} from 'react-native'

import { Images } from '../../assets/images'
import { reset } from '../../state/navigation'
import type { NavigationHook, RootStackParamList } from '../../types/navigation'
import SvgImage from './SvgImage'

interface SuccessBase {
    iconImage?: ImageSourcePropType
    message?: React.ReactNode
    messageText?: string
    button?: React.ReactNode
    buttonText?: string
    nextScreen?: keyof RootStackParamList
    nextScreenProps?: RootStackParamList[keyof RootStackParamList]
}

interface SuccessWithCustomButton extends SuccessBase {
    button: React.ReactNode
    buttonText?: never
    nextScreen?: never
}

interface SuccessWithCustomBody extends SuccessBase {
    message: React.ReactNode
    messageText?: never
}

type SuccessProps =
    | SuccessBase
    | SuccessWithCustomBody
    | SuccessWithCustomButton

const Success: React.FC<SuccessProps> = ({
    message,
    messageText,
    nextScreen = 'TabsNavigator',
    nextScreenProps = undefined,
    button,
    buttonText,
}: SuccessProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    return (
        <ImageBackground
            source={Images.HoloBackground}
            style={styles(theme).container}>
            <View style={styles(theme).detailsContainer}>
                <SvgImage
                    name="Check"
                    svgProps={{
                        height: theme.sizes.md,
                        width: theme.sizes.md,
                    }}
                />
                {message ? (
                    message
                ) : (
                    <Text h2 h2Style={styles(theme).successMessage}>
                        {messageText}
                    </Text>
                )}
            </View>
            <View style={styles(theme).buttonContainer}>
                {button ? (
                    button
                ) : (
                    <Button
                        title={buttonText ? buttonText : t('words.done')}
                        onPress={() => {
                            navigation.dispatch(
                                reset(nextScreen, nextScreenProps),
                            )
                        }}
                    />
                )}
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
            paddingHorizontal: theme.spacing.xl,
        },
        buttonContainer: {
            width: '100%',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            marginTop: 'auto',
            marginBottom: theme.spacing.xl,
        },
        detailsContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.secondary,
            marginTop: 'auto',
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
            height: theme.sizes.md,
            width: theme.sizes.md,
        },
        successMessage: {
            textAlign: 'center',
            marginVertical: theme.spacing.xl,
            paddingHorizontal: theme.spacing.xl,
        },
    })

export default Success
