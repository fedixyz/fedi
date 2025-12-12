import { useNavigation } from '@react-navigation/native'
import { Theme, useTheme } from '@rneui/themed'
import { useCallback } from 'react'
import { StyleSheet } from 'react-native'

import { NavigationHook } from '../../types/navigation'
import HeaderAvatar from '../feature/chat/HeaderAvatar'
import { Row } from './Flex'
import { PressableIcon } from './PressableIcon'

type Props = {
    onAddPress?: () => void
    onSearchPress?: () => void
    onShowCommunitiesPress?: () => void
}

const MainHeaderButtons: React.FC<Props> = ({
    onAddPress,
    onSearchPress,
    onShowCommunitiesPress,
}) => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const style = styles(theme)

    const openOmniScanner = useCallback(() => {
        return navigation.navigate('OmniScanner')
    }, [navigation])

    const openSettings = useCallback(() => {
        return navigation.navigate('Settings')
    }, [navigation])

    return (
        <Row align="center" gap="sm">
            {/* TODO: add gradients to bubbleButton styling to match designs */}
            {onShowCommunitiesPress && (
                <PressableIcon
                    containerStyle={style.icon}
                    onPress={onShowCommunitiesPress}
                    hitSlop={5}
                    svgName="HamburgerIcon"
                    svgProps={{ size: 24 }}
                />
            )}
            {onSearchPress && (
                <PressableIcon
                    testID="SearchButton"
                    containerStyle={style.icon}
                    onPress={onSearchPress}
                    hitSlop={5}
                    svgName="Search"
                    svgProps={{ size: 24 }}
                />
            )}
            {onAddPress && (
                <PressableIcon
                    testID="PlusButton"
                    containerStyle={style.icon}
                    onPress={onAddPress}
                    hitSlop={5}
                    svgName="Plus"
                    svgProps={{ size: 24 }}
                />
            )}
            <HeaderAvatar testID="AvatarButton" onPress={openSettings} />
            <PressableIcon
                testID="ScanButton"
                containerStyle={style.icon}
                onPress={openOmniScanner}
                hitSlop={5}
                svgName="Scan"
                svgProps={{ size: 23 }}
            />
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        icon: {
            alignItems: 'center',
            display: 'flex',
            height: theme.sizes.md,
            justifyContent: 'center',
            width: theme.sizes.md,
        },
    })

export default MainHeaderButtons
