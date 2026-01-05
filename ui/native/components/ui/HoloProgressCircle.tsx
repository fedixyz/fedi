import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ImageBackground, StyleSheet, View } from 'react-native'
import * as Progress from 'react-native-progress'

import { Images } from '../../assets/images'
import { Column } from './Flex'

export type Props = {
    percentComplete: number
}

const HoloProgressCircle: React.FC<Props> = ({ percentComplete }: Props) => {
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <Column center style={style.container}>
            {/*
                Since we cannot provide a color gradient to the Progress.Circle
                component, we work around this:

                4 absolutely positioned child elements within
                a relative parent all with the same center anchor.
                ordered back to front:

                1. Fixed size circle with strong HoloBackground image
                2. Slightly smaller white circle to partially cover #1 and
                create a holographic ring
                3. Animated progress bar circle to create a thin white ring
                4. Percentage text label
            */}
            <ImageBackground
                source={Images.HoloBackgroundStrong}
                style={style.holoCircle}
                imageStyle={style.holoCircleImage}
            />
            <View style={style.whiteCircle} />
            <View style={style.progressCircleContainer}>
                <Progress.Circle
                    // Here we invert the percentComplete so that the animated
                    // white ring starts at 100% and progressively uncovers the
                    // holographic gradient as it animates to 0%
                    progress={1 - Number((percentComplete / 100).toFixed(2))}
                    // these props define the white progress ring
                    color={theme.colors.white}
                    thickness={theme.sizes.progressCircleThickness}
                    size={theme.sizes.progressCircle}
                    // borderWidth hides the circle showing unfilled progress
                    borderWidth={1}
                />
            </View>
            <View style={style.percentLabelContainer}>
                <Text medium>{`${percentComplete}%`}</Text>
            </View>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'relative',
            height: theme.sizes.progressCircle,
            width: theme.sizes.progressCircle,
        },
        progressCircleContainer: {
            position: 'absolute',
        },
        percentLabelContainer: {
            position: 'absolute',
        },
        holoCircle: {
            position: 'absolute',
            // Shaves a couple pixels off the holographic ring
            // to remove a thin border that appears while the white
            // progress ring is uncovering the holographic ring
            height: theme.sizes.progressCircle - 2,
            width: theme.sizes.progressCircle - 2,
        },
        holoCircleImage: {
            borderRadius: theme.sizes.progressCircle * 0.5,
        },
        whiteCircle: {
            position: 'absolute',
            height: theme.sizes.progressInnerCircle,
            width: theme.sizes.progressInnerCircle,
            borderRadius: theme.sizes.progressInnerCircle * 0.5,
            backgroundColor: theme.colors.white,
        },
    })

export default HoloProgressCircle
