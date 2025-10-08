import { useState } from 'react'
import {
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView,
    ScrollViewProps,
    StyleSheet,
} from 'react-native'
import LinearGradient from 'react-native-linear-gradient'

import Flex from './Flex'

/**
 * A scroll view with an inset-like shadow at the top/bottom if you scroll up/down
 */
const ShadowScrollView = ({
    children,
    ...props
}: { children: React.ReactNode } & ScrollViewProps) => {
    const [showTopShadow, setShowTopShadow] = useState(false)
    const [showBottomShadow, setShowBottomShadow] = useState(true)

    const handleScroll = ({
        nativeEvent,
    }: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset } = nativeEvent

        setShowTopShadow(contentOffset.y > 0)
        setShowBottomShadow(contentOffset.y < 0)
    }

    return (
        <Flex grow shrink style={style.federationInfoContainer}>
            {showTopShadow && (
                <LinearGradient
                    style={[style.scrollInsetShadow, style.scrollTopShadow]}
                    colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0)']}
                />
            )}
            <ScrollView onScroll={handleScroll} {...props}>
                {children}
            </ScrollView>
            {showBottomShadow && (
                <LinearGradient
                    style={[style.scrollInsetShadow, style.scrollBottomShadow]}
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.05)']}
                />
            )}
        </Flex>
    )
}

const style = StyleSheet.create({
    federationInfoContainer: {
        position: 'relative',
    },
    scrollInsetShadow: {
        position: 'absolute',
        height: 40,
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
    },
    scrollTopShadow: {
        top: 0,
    },
    scrollBottomShadow: {
        bottom: 0,
    },
})

export default ShadowScrollView
