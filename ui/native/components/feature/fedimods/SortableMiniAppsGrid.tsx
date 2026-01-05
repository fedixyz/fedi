import { Button, Divider, Theme, Tooltip, useTheme } from '@rneui/themed'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    Vibration,
} from 'react-native'
import {
    Gesture,
    GestureDetector,
    PanGesture,
} from 'react-native-gesture-handler'
import Animated, {
    runOnJS,
    SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated'

import { shouldShowRearrangeMiniapps } from '@fedi/common/redux'
import { selectModsVisibility } from '@fedi/common/redux/mod'

import { useAppSelector } from '../../../state/hooks'
import { FediMod } from '../../../types'
import { Column } from '../../ui/Flex'
import ShortcutTile from '../home/ShortcutTile'
import ZendeskBadge from '../support/ZendeskBadge'

const SNAPPY_SPRING_CONFIG = {
    stiffness: 1200,
    damping: 420,
    mass: 4,
    overshootClamping: false,
    energyThreshold: 6e-9,
    velocity: 0,
}

type SortableMiniAppTileProps = {
    dragGesture: PanGesture
    dragOffsetShared: SharedValue<{ x: number; y: number }>
    activeAppIdShared: SharedValue<string | undefined>
    miniAppPositionIndices: SharedValue<{ [id: string]: number }>
    isRearranging: boolean
    itemHeight: number
    itemWidth: number
    miniAppId: string
    renderMiniApp: () => React.ReactElement | null
}

const SortableMiniAppTile = (props: SortableMiniAppTileProps) => {
    const {
        dragGesture,
        dragOffsetShared,
        activeAppIdShared,
        isRearranging,
        itemHeight,
        itemWidth,
        miniAppId,
        miniAppPositionIndices,
        renderMiniApp,
    } = props

    const { theme } = useTheme()
    const { width, fontScale } = useWindowDimensions()
    const columns = width / fontScale < 300 ? 2 : 3
    const style = styles(theme, columns)

    const appStyle = useAnimatedStyle(() => {
        const positionIndex = miniAppPositionIndices.value[miniAppId]
        if (positionIndex === undefined) {
            return {}
        }
        const isDragging = miniAppId === activeAppIdShared.value

        const column = positionIndex % columns
        const row = Math.floor(positionIndex / columns)

        const offset = isDragging
            ? { x: dragOffsetShared.value.x, y: dragOffsetShared.value.y }
            : { x: 0, y: 0 }

        const translateX = column * itemWidth + offset.x
        const translateY = row * itemHeight + offset.y

        return {
            ...style.shortcut,
            position: 'absolute',
            top: 0,
            left: 0,
            height: itemHeight,
            width: itemWidth,
            transform: [
                {
                    translateX: isRearranging
                        ? withSpring(translateX, SNAPPY_SPRING_CONFIG)
                        : translateX,
                },
                {
                    translateY: isRearranging
                        ? withSpring(translateY, SNAPPY_SPRING_CONFIG)
                        : translateY,
                },
                {
                    scale: isDragging
                        ? withSpring(1.25, SNAPPY_SPRING_CONFIG)
                        : 1,
                },
            ],
            opacity: isDragging ? 0.7 : 1,
            zIndex: isDragging ? 999 : 1,
        }
    })

    return (
        <GestureDetector key={miniAppId} gesture={dragGesture}>
            <Animated.View style={appStyle}>{renderMiniApp()}</Animated.View>
        </GestureDetector>
    )
}

type SortableMiniAppsGridProps = {
    miniApps: FediMod[]
    onHide: (miniApp: FediMod) => void
    onRearrange: (newOrder: FediMod['id'][]) => void
    onRemove: (miniApp: FediMod) => void
    onSelect: (miniApp: FediMod) => void
}

const triggerHapticFeedback = () => {
    Vibration.vibrate(100)
}

const SortableMiniAppsGrid = (props: SortableMiniAppsGridProps) => {
    const { miniApps, onHide, onRearrange, onRemove, onSelect } = props

    const { theme } = useTheme()
    const { t } = useTranslation()
    const modsVisibility = useAppSelector(selectModsVisibility)
    const shouldShowRearrange = useAppSelector(shouldShowRearrangeMiniapps)
    const [isRearranging, setIsRearranging] = useState<boolean>(false)
    const [actionsMod, setActionsMod] = useState<FediMod>()
    const { height, width, fontScale } = useWindowDimensions()
    const columns = width / fontScale < 300 ? 2 : 3
    const numRows = Math.floor(miniApps.length / columns)
    const itemWidth = width / columns
    const style = styles(theme, columns)
    const containerHeight = isRearranging ? height * 0.85 : height * 0.8
    const itemHeight = containerHeight / 6

    const activeAppIdShared = useSharedValue<string | undefined>(undefined)
    const pendingSwapIndex = useSharedValue<number | undefined>(undefined)

    const dragStart = useSharedValue({
        x: 0,
        y: 0,
    })
    const dragOffset = useSharedValue({
        x: 0,
        y: 0,
    })
    const totalCompensatedPosition = useSharedValue({
        x: 0,
        y: 0,
    })

    const indicesMap = useMemo(() => {
        return miniApps.reduce((acc, miniApp, index) => {
            return {
                ...acc,
                [miniApp.id]: index,
            }
        }, {})
    }, [miniApps])
    const miniAppPositionIndices = useSharedValue<{ [id: string]: number }>(
        indicesMap,
    )

    const handleHoldMiniApp = (miniApp: FediMod) => {
        if (!isRearranging) {
            // haptic feedback when we are about to rearrange
            triggerHapticFeedback()
            setActionsMod(miniApp)
        }
    }

    const handleSelectMiniApp = (miniApp: FediMod) => {
        setActionsMod(undefined)
        onSelect(miniApp)
    }

    const handleHideMiniApp = (miniApp: FediMod) => {
        setActionsMod(undefined)
        onHide(miniApp)
    }

    const handleRemoveMiniApp = (miniApp: FediMod) => {
        setActionsMod(undefined)
        onRemove(miniApp)
    }

    const handleStartRearranging = () => {
        setActionsMod(undefined)
        setIsRearranging(true)
    }

    const handleFinishRearranging = () => {
        setIsRearranging(false)
        const sortedIds = Object.keys(miniAppPositionIndices.value).sort(
            (a, b) => {
                const indexA = miniAppPositionIndices.value[a]
                const indexB = miniAppPositionIndices.value[b]

                return indexA - indexB
            },
        )

        onRearrange(sortedIds)
    }

    useEffect(() => {
        miniAppPositionIndices.value = indicesMap
    }, [indicesMap, miniAppPositionIndices])

    const getDragGesture = (miniAppId: string) => {
        return Gesture.Pan()
            .enabled(isRearranging)
            .activateAfterLongPress(250)
            .onStart(evt => {
                runOnJS(triggerHapticFeedback)() // haptic feedback when starting to drag
                activeAppIdShared.value = miniAppId
                pendingSwapIndex.value = -1
                dragStart.value = {
                    x: evt.absoluteX,
                    y: evt.absoluteY,
                }

                dragOffset.value = {
                    x: 0,
                    y: 0,
                }

                totalCompensatedPosition.value = {
                    x: 0,
                    y: 0,
                }
            })
            .onUpdate(evt => {
                const effectiveOffset = {
                    x: evt.translationX - totalCompensatedPosition.value.x,
                    y: evt.translationY - totalCompensatedPosition.value.y,
                }

                const colDisplacement = Math.round(
                    effectiveOffset.x / itemWidth,
                )
                const rowDisplacement = Math.round(
                    effectiveOffset.y / itemHeight,
                )
                const totalIndexChange =
                    rowDisplacement * columns + colDisplacement

                if (totalIndexChange !== 0) {
                    // prevent index change if icon is being dragged off the screen
                    // otherwise the last
                    const isOnLeftEdge = evt.absoluteX < itemWidth / 4
                    const isOnRightEdge = evt.absoluteX > width - itemWidth / 4
                    if (isOnLeftEdge || isOnRightEdge) {
                        return
                    }

                    const myIndex = miniAppPositionIndices.value[miniAppId]
                    const otherIndex = myIndex + totalIndexChange

                    if (
                        otherIndex < 0 ||
                        otherIndex >
                            Object.keys(miniAppPositionIndices.value).length
                    ) {
                        return
                    }

                    const otherAppId = Object.keys(
                        miniAppPositionIndices.value,
                    ).find(id => {
                        return (
                            id !== miniAppId &&
                            miniAppPositionIndices.value[id] === otherIndex
                        )
                    })

                    if (
                        otherAppId !== undefined &&
                        otherIndex !== pendingSwapIndex.value
                    ) {
                        const compensationX = colDisplacement * itemWidth
                        const compensationY = rowDisplacement * itemHeight

                        totalCompensatedPosition.value = {
                            x: totalCompensatedPosition.value.x + compensationX,
                            y: totalCompensatedPosition.value.y + compensationY,
                        }

                        miniAppPositionIndices.value[miniAppId] = otherIndex
                        miniAppPositionIndices.value[otherAppId] = myIndex

                        pendingSwapIndex.value = otherIndex
                    }
                }

                dragOffset.value = {
                    x: effectiveOffset.x,
                    y: effectiveOffset.y,
                }
            })
            .onEnd(() => {
                activeAppIdShared.value = undefined
                pendingSwapIndex.value = undefined
            })
    }

    const renderMiniApp = (miniAppId: string) => {
        const miniApp = miniApps.find(ma => ma.id === miniAppId)
        if (!miniApp) return null
        const isCustomMod = modsVisibility[miniApp.id]?.isCustom

        let numActionButtons = 1
        if (shouldShowRearrange) {
            numActionButtons++
        }
        if (isCustomMod) {
            numActionButtons++
        }

        return (
            <Tooltip
                withOverlay
                withPointer
                closeOnlyOnBackdropPress
                overlayColor={theme.colors.overlay}
                height={numActionButtons * 40}
                width={96}
                visible={actionsMod?.id === miniAppId}
                key={`tooltip-${miniApp.id}-${containerHeight}`}
                onClose={() => setActionsMod(undefined)}
                containerStyle={style.tooltipPopover}
                popover={
                    <>
                        <Pressable
                            style={style.tooltipAction}
                            onPress={() => handleHideMiniApp(miniApp)}>
                            <Text style={style.tooltipText}>
                                {t('words.hide')}
                            </Text>
                        </Pressable>

                        {shouldShowRearrange && (
                            <>
                                <Divider orientation="vertical" />

                                <Pressable
                                    style={style.tooltipAction}
                                    onPress={() => handleStartRearranging()}>
                                    <Text style={style.tooltipText}>
                                        {t('words.rearrange')}
                                    </Text>
                                </Pressable>
                            </>
                        )}

                        {isCustomMod && (
                            <>
                                <Divider orientation="vertical" />
                                <Pressable
                                    style={style.tooltipAction}
                                    onPress={() =>
                                        handleRemoveMiniApp(miniApp)
                                    }>
                                    <Text style={style.tooltipText}>
                                        {t('words.remove')}
                                    </Text>
                                </Pressable>
                            </>
                        )}
                    </>
                }>
                <ShortcutTile
                    shortcut={miniApp}
                    onSelect={() => handleSelectMiniApp(miniApp)}
                    onHold={handleHoldMiniApp}
                />
                <ZendeskBadge title={miniApp.title} />
            </Tooltip>
        )
    }

    const renderMiniApps = () => {
        return miniApps.map(({ id: miniAppId }) => {
            return (
                <SortableMiniAppTile
                    key={miniAppId}
                    dragGesture={getDragGesture(miniAppId)}
                    dragOffsetShared={dragOffset}
                    activeAppIdShared={activeAppIdShared}
                    isRearranging={isRearranging}
                    itemHeight={itemHeight}
                    itemWidth={itemWidth}
                    miniAppId={miniAppId}
                    miniAppPositionIndices={miniAppPositionIndices}
                    renderMiniApp={() => renderMiniApp(miniAppId)}
                />
            )
        })
    }

    const scrollContentContainerStyle = {
        ...style.listContainer,
        height: (numRows + 2) * itemHeight,
    }

    return (
        <Column style={style.container}>
            {isRearranging && (
                <Column center style={style.rearrangeHeader}>
                    <Text style={style.rearrangeHeaderText}>
                        Hold and drag to rearrange
                    </Text>
                </Column>
            )}

            <ScrollView
                style={style.scrollContainer}
                contentContainerStyle={scrollContentContainerStyle}>
                {renderMiniApps()}
            </ScrollView>

            {isRearranging && (
                <Column center style={style.rearrangeFooterButton}>
                    <Button
                        fullWidth
                        title={t('words.done')}
                        onPress={handleFinishRearranging}
                    />
                </Column>
            )}
        </Column>
    )
}

const styles = (theme: Theme, columns: number) =>
    StyleSheet.create({
        container: {
            flexGrow: 1,
        },
        scrollContainer: {
            flex: 1,
        },
        shortcut: { width: `${100 / columns}%` },
        listContainer: {
            marginTop: theme.spacing.sm,
        },
        modRemovalOverlay: {
            alignItems: 'center',
            justifyContent: 'center',
            height: 96,
            width: 96,
        },
        modRemovalOverlayBgImage: {
            backgroundColor: theme.colors.yellow,
            opacity: 0.4,
            width: 96,
            height: 96,
            borderRadius: 48,
            overflow: 'hidden',
            position: 'absolute',
        },
        modRemovalOverlayIcon: {
            position: 'relative',
            top: -4, // looks better when centering a triangle in a circle
        },
        rearrangeHeader: {
            padding: theme.spacing.lg,
        },
        rearrangeHeaderText: {
            color: theme.colors.darkGrey,
        },
        rearrangeFooterButton: {
            padding: theme.spacing.sm,
            zIndex: 1000,
        },
        tooltipAction: {
            flexDirection: 'row',
            alignItems: 'center',
            flexGrow: 1,
            padding: theme.spacing.sm,
        },
        tooltipPopover: {
            backgroundColor: theme.colors.darkGrey,
            padding: 0,
        },
        tooltipText: {
            color: theme.colors.white,
            flexGrow: 1,
        },
    })

export default SortableMiniAppsGrid
