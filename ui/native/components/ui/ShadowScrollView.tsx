import { useState } from 'react'
import {
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView,
    ScrollViewProps,
    StyleSheet,
    View,
} from 'react-native'

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
                <View
                    style={[style.scrollInsetShadow, style.scrollTopShadow]}
                />
            )}
            <ScrollView onScroll={handleScroll} {...props}>
                {children}
            </ScrollView>
            {showBottomShadow && (
                <View
                    style={[style.scrollInsetShadow, style.scrollBottomShadow]}
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
        experimental_backgroundImage:
            'linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0))',
    },
    scrollBottomShadow: {
        bottom: 0,
        experimental_backgroundImage:
            'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.05))',
    },
})

export default ShadowScrollView
