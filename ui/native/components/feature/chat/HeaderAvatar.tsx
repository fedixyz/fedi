import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { selectMatrixAuth } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import Avatar, { AvatarSize } from '../../ui/Avatar'
import { BubbleView } from '../../ui/BubbleView'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type Props = {
    onPress: () => void
}
const HeaderAvatar: React.FC<Props> = ({ onPress }) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const contents = !matrixAuth ? (
        <SvgImage
            name={'Smile'}
            size={SvgImageSize.sm}
            containerStyle={style.iconContainer}
            maxFontSizeMultiplier={theme.multipliers.headerMaxFontMultiplier}
        />
    ) : (
        <View style={style.avatarContainer}>
            <Avatar
                id={matrixAuth?.userId || ''}
                url={matrixAuth?.avatarUrl}
                size={AvatarSize.sm}
                name={matrixAuth?.displayName || ''}
                containerStyle={style.avatarContainer}
                maxFontSizeMultiplier={
                    theme.multipliers.headerMaxFontMultiplier
                }
            />
        </View>
    )

    return (
        <Pressable hitSlop={10} onPress={onPress}>
            <BubbleView containerStyle={style.container}>{contents}</BubbleView>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderRadius: 40,
            marginRight: theme.spacing.xs,
        },
        iconContainer: {
            padding: theme.spacing.xs,
            backgroundColor: theme.colors.lightGrey,
            borderRadius: 40,
        },
        avatarContainer: {
            borderRadius: 40,
        },
    })

export default HeaderAvatar
