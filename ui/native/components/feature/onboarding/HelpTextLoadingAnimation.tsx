import { Theme, useTheme } from '@rneui/themed'
import { useRef, useState, useCallback, useEffect } from 'react'
import { Animated, Image, StyleSheet } from 'react-native'

import { FediLoaders } from '../../../assets/images'

const LOADING_ANIMATION_DURATION_MS = 4000
const LOADING_FADE_DURATION_MS = 1000

export const HelpTextLoadingAnimation: React.FC = () => {
    const animationCount = FediLoaders.length
    const opacity = useRef(new Animated.Value(1)).current
    const [animationIndex, setAnimationIndex] = useState(0)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const fadeOutRef = useRef<Animated.CompositeAnimation | null>(null)
    const fadeInRef = useRef<Animated.CompositeAnimation | null>(null)

    const clearAnimations = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
        fadeOutRef.current?.stop()
        fadeInRef.current?.stop()
    }, [])

    const scheduleNextTransition = useCallback(() => {
        if (animationCount <= 1) return

        clearAnimations()

        timeoutRef.current = setTimeout(() => {
            fadeOutRef.current = Animated.timing(opacity, {
                toValue: 0,
                duration: LOADING_FADE_DURATION_MS,
                useNativeDriver: true,
            })

            fadeOutRef.current.start(({ finished }) => {
                if (!finished) return

                setAnimationIndex(
                    currentIndex => (currentIndex + 1) % animationCount,
                )

                fadeInRef.current = Animated.timing(opacity, {
                    toValue: 1,
                    duration: LOADING_FADE_DURATION_MS,
                    useNativeDriver: true,
                })

                fadeInRef.current.start(({ finished: fadeInFinished }) => {
                    if (fadeInFinished) {
                        scheduleNextTransition()
                    }
                })
            })
        }, LOADING_ANIMATION_DURATION_MS)
    }, [animationCount, clearAnimations, opacity])

    useEffect(() => {
        scheduleNextTransition()

        return () => {
            clearAnimations()
            opacity.stopAnimation()
        }
    }, [clearAnimations, opacity, scheduleNextTransition])

    const currentAnimation =
        animationCount > 0
            ? FediLoaders[animationIndex % animationCount]
            : undefined

    const { theme } = useTheme()
    const s = styles(theme)

    return (
        <Animated.View
            accessibilityRole="progressbar"
            style={[s.loadingAnimationContainer, { opacity }]}>
            {currentAnimation ? (
                <Image
                    key={animationIndex}
                    source={currentAnimation}
                    style={s.loadingAnimation}
                    resizeMode="contain"
                />
            ) : null}
        </Animated.View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        loadingAnimationContainer: {
            marginBottom: theme.spacing.md,
            width: 200,
            height: 200,
            alignItems: 'center',
            justifyContent: 'center',
        },
        loadingAnimation: {
            width: '100%',
            height: '100%',
        },
    })
