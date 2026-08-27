import React, { useEffect, useRef } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated'

/**
 * One-shot celebratory confetti burst, ported from the prototype's canvas
 * implementation (fedi-lab `launchConfetti`). Pieces spawn above the screen
 * and fall past the bottom edge with a quadratic ease standing in for the
 * canvas version's per-frame gravity. Mount it to fire; it never loops.
 */

// same palette as the prototype burst
const COLORS = [
    '#0285F5',
    '#00A854',
    '#7C3AED',
    '#FFD700',
    '#FF6B6B',
    '#00B37E',
]

// the canvas version throws 90; RN animates each piece as its own view, so
// keep the count where a burst still reads dense but stays cheap
const PIECE_COUNT = 48

type Piece = {
    /** Horizontal spawn position as a fraction of the screen width. */
    x: number
    /** Sideways drift over the whole fall, in px. */
    drift: number
    /** Total rotation over the whole fall, in degrees. */
    rotation: number
    delay: number
    duration: number
    width: number
    height: number
    color: string
}

const makePieces = (): Piece[] =>
    Array.from({ length: PIECE_COUNT }, () => ({
        x: Math.random(),
        drift: (Math.random() - 0.5) * 220,
        rotation: (Math.random() - 0.5) * 1440,
        delay: Math.random() * 350,
        duration: 1400 + Math.random() * 1000,
        width: Math.random() * 9 + 4,
        height: Math.random() * 5 + 3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))

const ConfettiPiece: React.FC<{ piece: Piece; fallHeight: number }> = ({
    piece,
    fallHeight,
}) => {
    const progress = useSharedValue(0)

    useEffect(() => {
        progress.value = withDelay(
            piece.delay,
            withTiming(1, {
                duration: piece.duration,
                easing: Easing.in(Easing.quad),
            }),
        )
        // fire-once burst; the piece never re-animates
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: -20 + progress.value * (fallHeight + 60) },
            { translateX: piece.drift * progress.value },
            { rotate: `${piece.rotation * progress.value}deg` },
        ],
    }))

    return (
        <Animated.View
            style={[
                styles.piece,
                {
                    left: `${piece.x * 100}%`,
                    width: piece.width,
                    height: piece.height,
                    backgroundColor: piece.color,
                },
                animatedStyle,
            ]}
        />
    )
}

export const ConfettiBurst: React.FC = () => {
    const { height } = useWindowDimensions()
    // pieces are randomized once; re-renders must not reshuffle mid-fall
    const pieces = useRef(makePieces()).current

    return (
        <View pointerEvents="none" style={styles.container}>
            {pieces.map((piece, i) => (
                <ConfettiPiece key={i} piece={piece} fallHeight={height} />
            ))}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
        zIndex: 400,
    },
    piece: {
        borderRadius: 1,
        position: 'absolute',
        top: 0,
    },
})

export default ConfettiBurst
