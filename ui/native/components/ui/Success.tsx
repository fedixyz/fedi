import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, ImageSourcePropType, StyleSheet } from 'react-native'

import { reset } from '../../state/navigation'
import type { NavigationHook, RootStackParamList } from '../../types/navigation'
import { Column } from './Flex'
import HoloCircle from './HoloCircle'
import { SafeAreaContainer } from './SafeArea'
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

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="all">
            <Column center grow>
                <HoloCircle
                    size={CIRCLE_SIZE}
                    content={
                        <Column gap="sm" center grow fullWidth>
                            <SvgImage name="Check" size={theme.sizes.md} />
                            {message ? (
                                message
                            ) : (
                                <Text h2 h2Style={style.successMessage}>
                                    {messageText}
                                </Text>
                            )}
                        </Column>
                    }
                />
            </Column>
            <Column fullWidth>
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
            </Column>
        </SafeAreaContainer>
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
