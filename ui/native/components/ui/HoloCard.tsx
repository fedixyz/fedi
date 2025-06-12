import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ImageBackground, StyleSheet } from 'react-native'

import { Images } from '../../assets/images'
import Flex from './Flex'

type HoloCardProps = {
    iconImage?: React.ReactNode | null
    title?: string | null
    body: React.ReactNode
}

const HoloCard: React.FC<HoloCardProps> = ({
    iconImage = null,
    title = null,
    body,
}: HoloCardProps) => {
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <ImageBackground
            source={Images.HoloBackground}
            style={style.container}
            imageStyle={style.roundedBorder}>
            <Flex align="center" fullWidth style={style.innerContainer}>
                {iconImage}

                {title && (
                    <Text bold style={style.titleText}>
                        {title}
                    </Text>
                )}
                {body}
            </Flex>
        </ImageBackground>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            alignItems: 'center',
            marginVertical: theme.spacing.xs,
        },
        iconImage: {
            height: theme.sizes.sm,
            width: theme.sizes.sm,
        },
        innerContainer: {
            padding: theme.spacing.xl,
        },
        roundedBorder: {
            borderRadius: theme.borders.defaultRadius,
        },
        titleText: {
            marginVertical: theme.spacing.md,
        },
    })

export default HoloCard
