import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { selectMatrixAuth } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import Avatar, { AvatarSize } from '../../ui/Avatar'
import { Pressable } from '../../ui/Pressable'
import { PressableIcon } from '../../ui/PressableIcon'
import { SvgImageSize } from '../../ui/SvgImage'

type Props = {
    onPress: () => void
    testID?: string
}

const HeaderAvatar: React.FC<Props> = ({ onPress }) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const matrixAuth = useAppSelector(selectMatrixAuth)

    if (!matrixAuth || matrixAuth.avatarUrl == null) {
        return (
            <View style={style.gradientContainer}>
                <PressableIcon
                    testID="AvatarButton"
                    hitSlop={10}
                    onPress={onPress}
                    svgName="ProfileThicker"
                    svgProps={{ size: SvgImageSize.sm }}
                    containerStyle={style.iconContainer}
                    maxFontSizeMultiplier={
                        theme.multipliers.headerMaxFontMultiplier
                    }
                />
            </View>
        )
    }

    return (
        <Pressable
            testID="AvatarButton"
            hitSlop={10}
            onPress={onPress}
            containerStyle={style.pressableContainer}>
            <Avatar
                id={matrixAuth.userId}
                url={matrixAuth.avatarUrl}
                size={AvatarSize.xs}
                name={matrixAuth.displayName}
                containerStyle={style.avatarContainer}
                maxFontSizeMultiplier={
                    theme.multipliers.headerMaxFontMultiplier
                }
            />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        pressableContainer: {
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.xs,
            width: undefined, // unsets width set in Pressable
        },
        bubbleContainer: {
            borderRadius: 40,
            marginRight: theme.spacing.xs,
        },
        avatarContainer: {
            borderRadius: 40,
        },
        gradientContainer: {
            padding: theme.spacing.xxs,
            alignSelf: 'center',
            borderRadius: 50,
            ...theme.styles.subtleShadow,
        },
        gradient: {},
        iconContainer: {
            padding: theme.spacing.xs,
            borderRadius: 50,
        },
    })

export default HeaderAvatar
