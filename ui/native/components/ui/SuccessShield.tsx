import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
    Image,
    ImageSourcePropType,
    StyleSheet,
    useWindowDimensions,
} from 'react-native'

import { Images } from '../../assets/images'
import { reset } from '../../state/navigation'
import type { NavigationHook, RootStackParamList } from '../../types/navigation'
import { Column } from './Flex'
import GradientView from './GradientView'
import { SafeAreaContainer } from './SafeArea'

type SuccessBase = {
    iconImage?: ImageSourcePropType
    message?: React.ReactNode
    messageText?: string
    button?: React.ReactNode
    buttonText?: string
    nextScreen?: keyof RootStackParamList
    nextScreenProps?: RootStackParamList[keyof RootStackParamList]
}

type SuccessWithCustomButton = SuccessBase & {
    button: React.ReactNode
    buttonText?: never
    nextScreen?: never
}

type SuccessWithCustomBody = SuccessBase & {
    message: React.ReactNode
    messageText?: never
}

type SuccessProps =
    | SuccessBase
    | SuccessWithCustomBody
    | SuccessWithCustomButton

const SuccessShield: React.FC<SuccessProps> = ({
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
    const dimensions = useWindowDimensions()

    const logoSize = Math.min(dimensions.width / 2, 300)

    const style = styles(theme)

    return (
        <GradientView variant="sky" style={style.container}>
            <SafeAreaContainer edges="all">
                <Column center grow gap="lg" fullWidth>
                    <Column center gap="lg">
                        <Image
                            resizeMode="contain"
                            source={Images.HoloShield}
                            style={{ width: logoSize, height: logoSize }}
                            width={logoSize}
                            height={logoSize}
                        />
                        {message ? (
                            message
                        ) : (
                            <Text h2 h2Style={style.successMessage}>
                                {messageText}
                            </Text>
                        )}
                    </Column>
                </Column>
                {button ? (
                    button
                ) : (
                    <Button
                        title={buttonText ? buttonText : t('words.done')}
                        titleProps={{ bold: true }}
                        fullWidth
                        onPress={() => {
                            navigation.dispatch(
                                reset(nextScreen, nextScreenProps),
                            )
                        }}
                    />
                )}
            </SafeAreaContainer>
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        successMessage: {
            textAlign: 'center',
            marginVertical: theme.spacing.xl,
            paddingHorizontal: theme.spacing.xl,
        },
    })

export default SuccessShield
