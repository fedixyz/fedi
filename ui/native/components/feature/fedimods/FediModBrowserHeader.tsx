import { useNavigation } from '@react-navigation/native'
import { Divider, Text, Theme, Tooltip, useTheme } from '@rneui/themed'
import React, { RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Alert,
    Animated,
    LayoutChangeEvent,
    StyleSheet,
    View,
} from 'react-native'
import WebView from 'react-native-webview'

import { useToast } from '@fedi/common/hooks/toast'
import {
    clearMiniAppHistory,
    closeBrowser,
    goBackInHistory,
    goForwardInHistory,
    selectCanGoBack,
    selectCanGoForward,
    selectCurrentUrlFormatted,
    selectFediModShowClearCacheButton,
    setAddressOverlayOpen,
} from '@fedi/common/redux'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { Row } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import { PressableIcon } from '../../ui/PressableIcon'

const TOOLTIP_ITEM_HEIGHT = 40

type FediModBrowserHeaderProps = {
    webViewRef: RefObject<WebView | null>
    isBrowserLoading: boolean
    browserLoadProgress: number
}

const NavigationButtons: React.FC = () => {
    const dispatch = useAppDispatch()
    const canGoBack = useAppSelector(selectCanGoBack)
    const canGoForward = useAppSelector(selectCanGoForward)

    return (
        <Row gap="xs">
            <PressableIcon
                svgName="ChevronLeft"
                hitSlop={10}
                disabled={!canGoBack}
                onPress={
                    canGoBack ? () => dispatch(goBackInHistory()) : undefined
                }
            />
            <PressableIcon
                svgName="ChevronRight"
                hitSlop={10}
                disabled={!canGoForward}
                onPress={
                    canGoForward
                        ? () => dispatch(goForwardInHistory())
                        : undefined
                }
            />
        </Row>
    )
}

type AddressBarProps = {
    isLoading: boolean
    loadProgress: number
}

const AddressBar: React.FC<AddressBarProps> = ({ isLoading, loadProgress }) => {
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const url = useAppSelector(selectCurrentUrlFormatted)
    const animatedProgress = useRef(new Animated.Value(0)).current
    const animatedOpacity = useRef(new Animated.Value(1)).current
    const [addressWidth, setAddressWidth] = useState(0)

    const style = styles(theme)

    useEffect(() => {
        Animated.timing(animatedProgress, {
            toValue: loadProgress * addressWidth,
            duration: 200,
            useNativeDriver: false,
        }).start()
    }, [loadProgress, animatedProgress, addressWidth])

    useEffect(() => {
        Animated.timing(animatedOpacity, {
            toValue: isLoading ? 1 : 0,
            duration: 200,
            delay: 400,
            useNativeDriver: false,
        }).start()
    }, [isLoading, animatedOpacity])

    const handleLayout = (e: LayoutChangeEvent) => {
        const width = e.nativeEvent.layout.width
        setAddressWidth(width)
    }

    return (
        <Pressable
            containerStyle={style.addressInput}
            disabled={isLoading && loadProgress < 1}
            onPress={() => dispatch(setAddressOverlayOpen(true))}
            onLayout={handleLayout}>
            <Text
                numberOfLines={1}
                ellipsizeMode="middle"
                style={style.addressText}>
                {url}
            </Text>
            <Animated.View
                style={{
                    ...style.progressBar,
                    opacity: animatedOpacity,
                    width: animatedProgress,
                }}
            />
        </Pressable>
    )
}

type MoreActionsTooltipProps = {
    webViewRef: RefObject<WebView | null>
    isLoading: boolean
    showMenu: boolean
    handleClose: () => void
    onToggleMenu: () => void
}

const MoreActionsTooltip: React.FC<MoreActionsTooltipProps> = ({
    webViewRef,
    isLoading,
    showMenu,
    handleClose,
    onToggleMenu,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const canGoBack = useAppSelector(selectCanGoBack)
    const canGoForward = useAppSelector(selectCanGoForward)
    const showClearCacheButton = useAppSelector(
        selectFediModShowClearCacheButton,
    )

    const style = styles(theme)

    const hasHistory = canGoBack || canGoForward
    // 2 tooltip items by default
    // 1 more item to clear history if there is history
    // 1 more item to clear cache if enabled in dev settings
    const tooltipHeight =
        (2 + (hasHistory ? 1 : 0) + (showClearCacheButton ? 1 : 0)) *
        TOOLTIP_ITEM_HEIGHT

    const handleRefresh = () => {
        onToggleMenu()
        webViewRef?.current?.reload()
    }

    const handleClearCache = () => {
        onToggleMenu()
        Alert.alert(
            t('feature.fedimods.clear-cache'),
            t('feature.fedimods.clear-cache-info'),
            [
                {
                    text: t('words.cancel'),
                    style: 'cancel',
                },
                {
                    text: t('feature.fedimods.clear-cache-ram'),
                    onPress: () => {
                        if (webViewRef?.current?.clearCache) {
                            webViewRef.current.clearCache(false)
                            toast.show(
                                t('feature.fedimods.clear-cache-ram-done'),
                            )
                        }
                    },
                },
                {
                    text: t('feature.fedimods.clear-cache-disk'),
                    onPress: () => {
                        if (webViewRef?.current?.clearCache) {
                            webViewRef.current.clearCache(true)
                            toast.show(
                                t('feature.fedimods.clear-cache-disk-done'),
                            )
                        }
                    },
                },
            ],
        )
    }

    const handleClearHistory = () => {
        onToggleMenu()
        dispatch(clearMiniAppHistory())
        toast.show(t('feature.fedimods.clear-history-done'))
    }

    const onExit = () => {
        onToggleMenu()
        handleClose()
    }

    return (
        <Tooltip
            withOverlay
            withPointer
            closeOnlyOnBackdropPress
            overlayColor={theme.colors.overlay}
            pointerColor={theme.colors.secondary}
            height={tooltipHeight}
            width={200}
            visible={showMenu}
            onClose={onToggleMenu}
            containerStyle={style.tooltipPopover}
            popover={
                <View
                    onStartShouldSetResponder={() => true}
                    style={style.tooltipContent}>
                    <Pressable
                        containerStyle={style.tooltipAction}
                        onPress={handleRefresh}>
                        <Text style={style.tooltipText}>
                            {t('words.refresh')}
                        </Text>
                    </Pressable>

                    {hasHistory && (
                        <>
                            <Divider orientation="vertical" />

                            <Pressable
                                containerStyle={style.tooltipAction}
                                onPress={handleClearHistory}>
                                <Text style={style.tooltipText}>
                                    {t('feature.fedimods.clear-history')}
                                </Text>
                            </Pressable>
                        </>
                    )}

                    {showClearCacheButton && (
                        <>
                            <Divider orientation="vertical" />

                            <Pressable
                                containerStyle={style.tooltipAction}
                                onPress={handleClearCache}>
                                <Text style={style.tooltipText}>
                                    {t('feature.fedimods.clear-cache')}
                                </Text>
                            </Pressable>
                        </>
                    )}

                    <Divider orientation="vertical" />

                    <Pressable
                        containerStyle={style.tooltipAction}
                        onPress={onExit}>
                        <Text style={style.tooltipText}>{t('words.exit')}</Text>
                    </Pressable>
                </View>
            }>
            <PressableIcon
                svgName="DotsMore"
                hitSlop={10}
                disabled={isLoading}
                onPress={isLoading ? undefined : onToggleMenu}
            />
        </Tooltip>
    )
}

const FediModBrowserHeader: React.FC<FediModBrowserHeaderProps> = ({
    webViewRef,
    isBrowserLoading,
    browserLoadProgress,
}) => {
    const { theme } = useTheme()
    const navigation = useNavigation()
    const dispatch = useAppDispatch()
    const [showMenu, setShowMenu] = useState(false)

    const style = styles(theme)

    const handleClose = () => {
        dispatch(closeBrowser())
        navigation.goBack()
    }

    return (
        <Row align="center" gap="sm" grow={false} style={style.container}>
            <NavigationButtons />
            <AddressBar
                isLoading={isBrowserLoading}
                loadProgress={browserLoadProgress}
            />
            <Row gap="xs">
                <MoreActionsTooltip
                    webViewRef={webViewRef}
                    isLoading={isBrowserLoading}
                    showMenu={showMenu}
                    handleClose={handleClose}
                    onToggleMenu={() => setShowMenu(!showMenu)}
                />
                <PressableIcon
                    svgName="Close"
                    hitSlop={10}
                    onPress={handleClose}
                />
            </Row>
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: theme.colors.lightGrey,
        },
        addressInput: {
            backgroundColor: theme.colors.extraLightGrey,
            flex: 1,
            borderRadius: 8,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden',
        },
        addressText: {
            width: '100%',
            textAlign: 'center',
        },
        progressBar: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            backgroundColor: theme.colors.blue,
        },
        tooltipPopover: {
            backgroundColor: theme.colors.secondary,
            padding: 0,
        },
        tooltipAction: {
            flexDirection: 'row',
            alignItems: 'center',
            flexGrow: 1,
            padding: theme.spacing.sm,
            borderRadius: 0,
        },
        tooltipText: {
            color: theme.colors.primary,
            flexGrow: 1,
        },
        tooltipContent: {
            width: '100%',
        },
    })

export default FediModBrowserHeader
