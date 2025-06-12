import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { selectMatrixAuth } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import Avatar, { AvatarSize } from '../../ui/Avatar'
import { BubbleView } from '../../ui/BubbleView'
import HoloGradient from '../../ui/HoloGradient'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

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
            <HoloGradient
                level="900"
                style={style.gradientContainer}
                gradientStyle={style.gradient}>
                <Pressable testID="AvatarButton" hitSlop={10} onPress={onPress}>
                    <SvgImage
                        name="ProfileThicker"
                        size={SvgImageSize.sm}
                        containerStyle={style.iconContainer}
                        maxFontSizeMultiplier={
                            theme.multipliers.headerMaxFontMultiplier
                        }
                    />
                </Pressable>
            </HoloGradient>
        )
    }

    return (
        <Pressable testID="AvatarButton" hitSlop={10} onPress={onPress}>
            <BubbleView containerStyle={style.bubbleContainer}>
                <View style={style.avatarContainer}>
                    <Avatar
                        id={matrixAuth.userId}
                        url={matrixAuth.avatarUrl}
                        size={AvatarSize.sm}
                        name={matrixAuth.displayName}
                        containerStyle={style.avatarContainer}
                        maxFontSizeMultiplier={
                            theme.multipliers.headerMaxFontMultiplier
                        }
                    />
                </View>
            </BubbleView>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bubbleContainer: {
            borderRadius: 40,
            marginRight: theme.spacing.xs,
        },
        avatarContainer: {
            borderRadius: 40,
        },
        gradientContainer: {
            borderRadius: 50,
            marginRight: theme.spacing.xs,
            ...theme.styles.subtleShadow,
        },
        gradient: {
            padding: theme.spacing.xxs,
            borderRadius: 50,
            alignSelf: 'center',
        },
        iconContainer: {
            padding: theme.spacing.xs,
            backgroundColor: theme.colors.white,
            borderRadius: 50,
        },
    })

export default HeaderAvatar
