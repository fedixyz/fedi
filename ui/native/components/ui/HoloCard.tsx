import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Column } from './Flex'
import GradientView from './GradientView'

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
        <GradientView variant="sky-banner" style={style.container}>
            <Column align="center" fullWidth style={style.innerContainer}>
                {iconImage}

                {title && (
                    <Text bold style={style.titleText}>
                        {title}
                    </Text>
                )}
                {body}
            </Column>
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            alignItems: 'center',
            marginVertical: theme.spacing.xs,
            borderRadius: theme.borders.defaultRadius,
        },
        iconImage: {
            height: theme.sizes.sm,
            width: theme.sizes.sm,
        },
        innerContainer: {
            padding: theme.spacing.xl,
        },
        titleText: {
            marginVertical: theme.spacing.md,
        },
    })

export default HoloCard
