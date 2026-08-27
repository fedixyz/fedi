/**
 * @file
 * The one-time spotlight tour for the Wallet Service dashboard.
 *
 * The overlay dims the whole window and leaves a transparent hole over the
 * element being described. It does not lift that element: React Native's
 * `zIndex` only orders siblings inside one parent, so raising a `ScrollView`
 * child above a scrim raises every other child with it.
 */
import { Text, Theme, useTheme } from '@rneui/themed'
import type { ParseKeys } from 'i18next'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dimensions,
    LayoutChangeEvent,
    Modal,
    Platform,
    Pressable as BasePressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Defs, Mask, Rect, Svg } from 'react-native-svg'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { Row } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'

/**
 * Matches the prototype's `rgba(11,16,19,.55)` scrim. Colour and opacity are
 * separate because `react-native-svg` takes opacity as its own prop.
 */
const SCRIM_COLOR = '#0B1013'
const SCRIM_OPACITY = 0.55
const HOLE_MASK_ID = 'wallet-service-tour-hole'
/** Breathing room between the highlighted element and the edge of the hole. */
const HOLE_PAD = 8
/** Corner radius of the spotlight hole. */
const HOLE_RADIUS = 16
/** Space between the hole and the card. */
const CARD_GAP = 14
/** Closest the card may come to the safe area. */
const EDGE = 16

/**
 * How far down the modal has to draw to line up with the screen behind it.
 *
 * `statusBarTranslucent` starts the modal window at the top of the screen,
 * while `measureInWindow` reports a target against the app window, which starts
 * below the status bar. Left uncorrected, every hole and card lands one status
 * bar too high — measured at 35 on a 1080x2400 Samsung, enough to leave the
 * balance card half covered by the scrim it is meant to be cut out of.
 *
 * iOS gets nothing: a modal there shares the app window's coordinate space, so
 * the two already agree. The height is read per device rather than assumed,
 * because a notch or punch-hole makes it anything from 24 upwards.
 *
 * Only the drawing is shifted. Measurement, and the above/below choice made
 * from it, stay in window space so both sides of the comparison agree.
 */
export function resolveModalTopOffset(
    platform: typeof Platform.OS,
    statusBarHeight: number | null | undefined,
): number {
    if (platform !== 'android') return 0
    return statusBarHeight ?? 0
}

const MODAL_TOP_OFFSET = resolveModalTopOffset(
    Platform.OS,
    StatusBar.currentHeight,
)

export type TourRect = {
    x: number
    y: number
    width: number
    height: number
}

export type WalletServiceTourStep = {
    /**
     * The element to highlight. Wrap the target in a plain `View` — a composed
     * component may not forward its ref to a node with `measureInWindow`.
     */
    ref: React.RefObject<View | null>
    // typed keys rather than string: t() only accepts keys it can prove exist
    titleKey: ParseKeys
    bodyKey: ParseKeys
}

export type TourCardPlacement = {
    /** Window offset for the top of the card. */
    top: number
    /** Height cap. Null when the card can take its natural height. */
    maxHeight: number | null
}

/**
 * Where the card sits for a given hole.
 *
 * Below the hole is the default, because reading runs downwards. Above is the
 * fallback. The third branch runs only when neither gap can hold the card — a
 * short window, a large OS font scale, or a long translation — and caps the
 * card to the larger gap so it can never cover the thing it describes. The
 * prototype has no third branch and lets the card overlap its own highlight.
 */
export function resolveTourCardPlacement({
    hole,
    cardHeight,
    windowHeight,
    insetTop,
    insetBottom,
}: {
    hole: TourRect
    cardHeight: number
    windowHeight: number
    insetTop: number
    insetBottom: number
}): TourCardPlacement {
    const safeTop = insetTop + EDGE
    const safeBottom = windowHeight - insetBottom - EDGE
    const below = hole.y + hole.height + CARD_GAP
    const above = hole.y - CARD_GAP - cardHeight

    if (below + cardHeight <= safeBottom) return { top: below, maxHeight: null }
    if (above >= safeTop) return { top: above, maxHeight: null }

    const gapBelow = safeBottom - below
    const gapAbove = hole.y - CARD_GAP - safeTop
    if (gapBelow >= gapAbove) {
        return {
            top: Math.min(below, safeBottom),
            maxHeight: Math.max(0, gapBelow),
        }
    }
    return { top: safeTop, maxHeight: Math.max(0, gapAbove) }
}

/** Grows a target rect into the hole drawn around it. */
export function resolveTourHole(target: TourRect): TourRect {
    return {
        x: Math.round(target.x) - HOLE_PAD,
        y: Math.round(target.y) - HOLE_PAD,
        width: Math.round(target.width) + HOLE_PAD * 2,
        height: Math.round(target.height) + HOLE_PAD * 2,
    }
}

type Props = {
    show: boolean
    /** Must be a stable reference — a new array each render re-measures forever. */
    steps: WalletServiceTourStep[]
    /** Called once, when the tour ends by any route. */
    onDone: () => void
}

export const WalletServiceTour: React.FC<Props> = ({ show, steps, onDone }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const insets = useSafeAreaInsets()
    const { width: windowWidth, height: windowHeight } = useWindowDimensions()

    const [rects, setRects] = useState<(TourRect | null)[] | null>(null)
    const [stepIndex, setStepIndex] = useState(0)
    // kept across steps so the card does not blink back to hidden every time
    // the copy changes and its height has to be measured again
    const [cardHeight, setCardHeight] = useState(0)

    const measureTargets = useCallback(() => {
        let isStale = false
        Promise.all(
            steps.map(
                step =>
                    new Promise<TourRect | null>(resolve => {
                        const node = step.ref.current
                        if (typeof node?.measureInWindow !== 'function')
                            return resolve(null)
                        node.measureInWindow((x, y, width, height) =>
                            resolve(
                                width > 0 && height > 0
                                    ? { x, y, width, height }
                                    : null,
                            ),
                        )
                    }),
            ),
        ).then(measured => {
            if (!isStale) setRects(measured)
        })
        return () => {
            isStale = true
        }
    }, [steps])

    // re-measure whenever the window can have changed shape under us: rotation,
    // and OS font scale, both of which move every target
    useEffect(() => {
        if (!show) {
            setRects(null)
            setStepIndex(0)
            return
        }
        return measureTargets()
    }, [show, measureTargets, windowWidth, windowHeight])

    /**
     * Steps whose target did not measure are dropped rather than rendered
     * against an empty highlight, and the counter is built from what survives —
     * so a dashboard that is missing a control shows a shorter honest tour.
     */
    const liveSteps = useMemo(() => {
        if (!rects) return []
        return steps
            .map((step, i) => ({ step, rect: rects[i] }))
            .filter(
                (
                    entry,
                ): entry is { step: WalletServiceTourStep; rect: TourRect } =>
                    Boolean(entry.rect),
            )
    }, [steps, rects])

    const activeStep = liveSteps[Math.min(stepIndex, liveSteps.length - 1)]

    const onCardLayout = useCallback((e: LayoutChangeEvent) => {
        setCardHeight(e.nativeEvent.layout.height)
    }, [])

    const isLastStep = stepIndex >= liveSteps.length - 1

    const handleNext = useCallback(() => {
        if (isLastStep) return onDone()
        setStepIndex(i => i + 1)
    }, [isLastStep, onDone])

    const style = styles(theme)

    if (!show || !activeStep) return null

    // the modal is status-bar translucent, so it covers more than the window
    // the app lays out in — the scrim is sized to the screen to match
    const screen = Dimensions.get('screen')
    const scrimWidth = Math.max(windowWidth, screen.width)
    const scrimHeight = Math.max(windowHeight, screen.height)

    const hole = resolveTourHole(activeStep.rect)
    const placement = resolveTourCardPlacement({
        hole,
        cardHeight,
        windowHeight,
        insetTop: insets.top,
        insetBottom: insets.bottom,
    })

    return (
        <Modal
            visible
            transparent
            statusBarTranslucent
            animationType="fade"
            onRequestClose={onDone}>
            {/* the scrim swallows every tap, so the highlighted control stays
                inert while it is being explained */}
            <BasePressable
                testID="wallet-service-tour-scrim"
                style={StyleSheet.absoluteFill}
                onPress={onDone}
            />

            {/* A mask, rather than dim rectangles arranged around the hole:
                only a mask can carve a concave rounded corner. Four abutting
                rectangles leave bright wedges wherever the corner curves away
                from their straight edges. */}
            <Svg
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
                width={scrimWidth}
                height={scrimHeight}>
                <Defs>
                    <Mask id={HOLE_MASK_ID}>
                        <Rect
                            x={0}
                            y={0}
                            width={scrimWidth}
                            height={scrimHeight}
                            fill="#fff"
                        />
                        <Rect
                            x={hole.x}
                            y={hole.y + MODAL_TOP_OFFSET}
                            width={hole.width}
                            height={hole.height}
                            rx={HOLE_RADIUS}
                            ry={HOLE_RADIUS}
                            fill="#000"
                        />
                    </Mask>
                </Defs>
                <Rect
                    x={0}
                    y={0}
                    width={scrimWidth}
                    height={scrimHeight}
                    fill={SCRIM_COLOR}
                    fillOpacity={SCRIM_OPACITY}
                    mask={`url(#${HOLE_MASK_ID})`}
                />
            </Svg>

            <View
                pointerEvents="box-none"
                style={[
                    style.cardRow,
                    { top: placement.top + MODAL_TOP_OFFSET },
                ]}>
                <View
                    testID="wallet-service-tour-card"
                    onLayout={onCardLayout}
                    style={[
                        style.card,
                        placement.maxHeight !== null && {
                            maxHeight: placement.maxHeight,
                        },
                        cardHeight === 0 && style.cardMeasuring,
                    ]}>
                    <Text style={style.eyebrow}>
                        {t('feature.wallet-service.tour-step', {
                            current: stepIndex + 1,
                            total: liveSteps.length,
                        })}
                    </Text>
                    <Text style={style.title}>
                        {t(activeStep.step.titleKey)}
                    </Text>
                    <ScrollView
                        scrollEnabled={placement.maxHeight !== null}
                        style={style.bodyScroll}>
                        <Text style={style.body}>
                            {t(activeStep.step.bodyKey)}
                        </Text>
                    </ScrollView>
                    <Row align="center" justify="between" style={style.actions}>
                        <Pressable
                            testID="wallet-service-tour-skip"
                            containerStyle={style.skipButton}
                            onPress={onDone}>
                            <Text style={style.skipLabel}>
                                {t('words.skip')}
                            </Text>
                        </Pressable>
                        <Pressable
                            testID="wallet-service-tour-next"
                            containerStyle={style.nextButton}
                            onPress={handleNext}>
                            <Text style={style.nextLabel}>
                                {isLastStep
                                    ? t('feature.wallet-service.tour-done')
                                    : t('words.next')}
                            </Text>
                        </Pressable>
                    </Row>
                </View>
            </View>
        </Modal>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        cardRow: {
            alignItems: 'center',
            left: 0,
            paddingHorizontal: 20,
            position: 'absolute',
            right: 0,
        },
        card: {
            backgroundColor: theme.colors.white,
            borderRadius: 18,
            maxWidth: 320,
            padding: 16,
            width: '100%',
        },
        cardMeasuring: {
            // hidden for the first frame only, while its height is unknown and
            // the placement below or above the hole cannot be resolved yet
            opacity: 0,
        },
        eyebrow: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            fontWeight: '600',
            letterSpacing: 1.1,
            paddingBottom: 6,
        },
        title: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.body,
            fontWeight: '600',
            paddingBottom: 4,
        },
        bodyScroll: {
            flexGrow: 0,
            flexShrink: 1,
        },
        body: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 19,
        },
        actions: {
            paddingTop: 14,
        },
        skipButton: {
            paddingHorizontal: 2,
            paddingVertical: 8,
            width: 'auto',
        },
        skipLabel: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '500',
        },
        nextButton: {
            // `nightLinearGradient` is a translucent white sheen —
            // rgba(255,255,255,0.2) to fully transparent — meant to sit *on*
            // the ink, not to be the background. The shared Button gets its ink
            // from RNEUI's own backgroundColor and layers the sheen over it; a
            // bare Pressable has to supply the ink itself. Without this the
            // wash fell straight onto the white card and the CTA rendered as a
            // pale grey pill with white text on it.
            backgroundColor: theme.colors.primary,
            experimental_backgroundImage: `linear-gradient(180deg, ${fediTheme.nightLinearGradient.join(', ')})`,
            borderRadius: 999,
            justifyContent: 'center',
            paddingHorizontal: 22,
            paddingVertical: 11,
            width: 'auto',
        },
        nextLabel: {
            color: theme.colors.secondary,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '600',
        },
    })
