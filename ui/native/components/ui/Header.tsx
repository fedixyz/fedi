import { useNavigation } from '@react-navigation/native'
import { Header as HeaderRNE, useTheme } from '@rneui/themed'
import React, { memo } from 'react'
import { View, ViewStyle } from 'react-native'

import { reset } from '../../state/navigation'
import { NavigationHook, TabsNavigatorParamList } from '../../types/navigation'
import { PressableIcon } from './PressableIcon'

interface HeaderBase {
    headerLeft?: React.ReactElement
    headerCenter?: React.ReactElement
    headerRight?: React.ReactElement
    leftContainerStyle?: ViewStyle
    centerContainerStyle?: ViewStyle
    rightContainerStyle?: ViewStyle
    containerStyle?: ViewStyle
    empty?: boolean
    dark?: boolean
    backButton?: boolean
    onBackButtonPress?: () => void
    closeButton?: boolean
    onClose?: () => void
    inline?: boolean
    transparent?: boolean
    closeRoute?: keyof TabsNavigatorParamList
}

interface HeaderWithBackButton extends HeaderBase {
    headerLeft: React.ReactElement
    backButton?: never
}

interface HeaderWithCloseButton extends HeaderBase {
    headerRight: React.ReactElement
    closeButton?: never
}

type HeaderProps = HeaderBase | HeaderWithBackButton | HeaderWithCloseButton

const Header: React.FC<HeaderProps> = memo(
    ({
        headerLeft,
        headerCenter,
        headerRight,
        leftContainerStyle = {},
        centerContainerStyle = {},
        rightContainerStyle = {},
        containerStyle = {},
        empty,
        dark,
        backButton,
        onBackButtonPress,
        closeButton,
        onClose,
        transparent,
        closeRoute,
    }: HeaderProps) => {
        const { theme } = useTheme()
        const navigation = useNavigation<NavigationHook>()

        // This logic allows for custom UI in the left side of the Header
        // but the backButton prop overrides any custom headerLeft component

        const leftComponent = backButton ? (
            <PressableIcon
                testID="HeaderBackButton"
                onPress={() =>
                    typeof onBackButtonPress === 'function'
                        ? onBackButtonPress()
                        : navigation.canGoBack()
                          ? navigation.goBack()
                          : navigation.navigate('TabsNavigator')
                }
                hitSlop={10}
                svgName="ChevronLeft"
                containerStyle={{
                    transform: [{ translateX: -theme.spacing.xs }],
                }}
            />
        ) : (
            <>{headerLeft || null}</>
        )

        // This logic allows for custom UI in the right side of the Header
        // but the closeButton prop overrides any custom headerRight component
        const rightComponent = closeButton ? (
            <PressableIcon
                testID="HeaderCloseButton"
                onPress={
                    onClose ||
                    (() =>
                        navigation.dispatch(
                            reset('TabsNavigator', {
                                initialRouteName: closeRoute ?? 'Home',
                            }),
                        ))
                }
                hitSlop={10}
                svgName="Close"
            />
        ) : (
            <>{headerRight || null}</>
        )

        // Merge default container styles defined in theme with prop overrides
        const {
            leftContainerStyle: defaultLeftContainerStyle,
            centerContainerStyle: defaultCenterContainerStyle,
            rightContainerStyle: defaultRightContainerStyle,
            containerStyle: defaultContainerStyle,
        } = theme.components.Header
        const mergedContainerStyle = {
            ...defaultContainerStyle,
            borderBottomColor: transparent
                ? 'transparent'
                : dark
                  ? theme.colors.primary
                  : defaultContainerStyle.borderBottomColor,
            shadowColor: transparent
                ? 'transparent'
                : defaultContainerStyle.shadowColor,
            paddingTop: theme.spacing.lg,
            ...containerStyle,
        }

        if (empty) {
            return <View style={{ marginTop: theme.spacing.xxl }} />
        }

        return (
            <HeaderRNE
                backgroundColor={
                    transparent
                        ? 'transparent'
                        : dark
                          ? theme.colors.primary
                          : theme.colors.secondary
                }
                barStyle={dark ? 'light-content' : 'dark-content'}
                containerStyle={mergedContainerStyle}
                centerComponent={<>{headerCenter || null}</>}
                leftComponent={leftComponent}
                rightComponent={rightComponent}
                leftContainerStyle={{
                    ...defaultLeftContainerStyle,
                    ...leftContainerStyle,
                }}
                centerContainerStyle={{
                    ...defaultCenterContainerStyle,
                    ...centerContainerStyle,
                }}
                rightContainerStyle={{
                    ...defaultRightContainerStyle,
                    ...rightContainerStyle,
                }}
            />
        )
    },
)

export default Header
