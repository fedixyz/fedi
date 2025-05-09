import React, { useRef, useEffect } from 'react'
import { Animated } from 'react-native'

import SvgImage, { SvgImageName, SvgImageProps, SvgImageSize } from './SvgImage'

type RotatingSvgProps = Omit<SvgImageProps, 'name'> & {
    name: SvgImageName
}

const RotatingSvg: React.FC<RotatingSvgProps> = ({
    name,
    size = SvgImageSize.md,
    containerStyle,
    color,
    dimensions,
    svgProps,
}) => {
    // Create an animated value that will be used for rotation.
    const rotateAnim = useRef(new Animated.Value(0)).current

    useEffect(() => {
        // Use Animated.loop to create a continuous rotation animation.
        Animated.loop(
            Animated.timing(rotateAnim, {
                toValue: 1,
                duration: 2000, // Duration for one complete rotation (2 seconds)
                useNativeDriver: true,
            }),
        ).start()
    }, [rotateAnim])

    // Interpolate the animated value to a string-based angle.
    const rotation = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    })

    return (
        <Animated.View
            style={[{ transform: [{ rotate: rotation }] }, containerStyle]}>
            <SvgImage
                name={name}
                size={size}
                color={color}
                dimensions={dimensions}
                svgProps={svgProps}
            />
        </Animated.View>
    )
}

export default RotatingSvg
