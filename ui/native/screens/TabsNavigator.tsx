import {
    createBottomTabNavigator,
    type BottomTabBarButtonProps,
} from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { MutableRefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    AppState,
    AppStateStatus,
    Pressable,
    Platform,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
    useWindowDimensions,
} from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

import StabilityPoolMonitorManager from '@fedi/common/components/StabilityPoolMonitorManager'
import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import {
    refreshCommunities,
    refreshFederations,
    selectCommunities,
    selectLastUsedTab,
    selectLoadedFederations,
    selectMatrixHasNotificationsIncludingInvites,
} from '@fedi/common/redux'
import { selectZendeskUnreadMessageCount } from '@fedi/common/redux/support'
import { HomeNavigationTab } from '@fedi/common/types/linking'

import PersonalBackupReminderOverlay from '../components/feature/backup/PersonalBackupReminderOverlay'
import ChatHeader from '../components/feature/chat/ChatHeader'
import CommunitiesOverlay from '../components/feature/federations/CommunitiesOverlay'
import WalletHeader from '../components/feature/federations/WalletHeader'
import HomeHeader from '../components/feature/home/HomeHeader'
import SelectWalletOverlay from '../components/feature/send/SelectWalletOverlay'
import GradientView from '../components/ui/GradientView'
import SvgImage, { getIconSizeMultiplier } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import {
    RootStackParamList,
    TABS_NAVIGATOR_ID,
    TabsNavigatorParamList,
} from '../types/navigation'
import ChatScreen from './ChatScreen'
import Home from './Home'
import Mods from './Mods'
import Wallet from './Wallet'

const MAX_TABS_FONT_SCALE = 1.2
const TAB_BAR_FADE_HEIGHT = 72

export type Props = NativeStackScreenProps<RootStackParamList, 'TabsNavigator'>

const Tab = createBottomTabNavigator<TabsNavigatorParamList>()

type TabBarButtonProps = BottomTabBarButtonProps & {
    pressedStyle: StyleProp<ViewStyle>
}

const TabBarButton: React.FC<TabBarButtonProps> = ({
    pressedStyle,
    style,
    ...props
}) => (
    <Pressable
        {...props}
        testID={props.testID}
        style={({ pressed }) => [style, pressed && pressedStyle]}
    />
)

const GradientFill: React.FC<{ backgroundColor: string }> = ({
    backgroundColor,
}) => (
    <View pointerEvents="none" style={gradientFillStyles.container}>
        <Svg style={gradientFillStyles.fade}>
            <Defs>
                <LinearGradient id="tabBarFade" x1="0" y1="0" x2="0" y2="1">
                    <Stop
                        offset="0"
                        stopColor={fediTheme.colors.night}
                        stopOpacity="0"
                    />
                    <Stop
                        offset="1"
                        stopColor={fediTheme.colors.night}
                        stopOpacity="0.06"
                    />
                </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#tabBarFade)" />
        </Svg>
        <View style={[gradientFillStyles.fill, { backgroundColor }]} />
    </View>
)

const TabsNavigator: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const [walletOverlayOpen, setWalletOverlayOpen] = useState(false)
    const [communitiesOverlayOpen, setCommunitiesOverlayOpen] = useState(false)
    const [shouldShowBackupReminder, setShouldShowBackupReminder] =
        useState(false)
    // TODO: Reimplement unseen logic with matrix
    // const hasUnseenMessages = useAppSelector(selectHasUnseenMessages)
    const hasUnreadMessages = useAppSelector(
        selectMatrixHasNotificationsIncludingInvites,
    )
    const communities = useAppSelector(selectCommunities)
    const loadedFederations = useAppSelector(selectLoadedFederations)
    const zendeskMsgCount = useAppSelector(selectZendeskUnreadMessageCount)
    const lastUsedTab = useAppSelector(selectLastUsedTab)

    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const appStateRef = useRef<AppStateStatus>(
        AppState.currentState,
    ) as MutableRefObject<AppStateStatus>

    const tabToSceenMap: Record<
        HomeNavigationTab,
        keyof TabsNavigatorParamList
    > = {
        [HomeNavigationTab.Home]: 'Home',
        [HomeNavigationTab.Chat]: 'Chat',
        [HomeNavigationTab.MiniApps]: 'Mods',
        [HomeNavigationTab.Wallet]: 'Wallet',
    }

    const { fontScale } = useWindowDimensions()

    // This logic is needed refresh federation metadata
    useEffect(() => {
        // Subscribe to changes in AppState to detect when app goes from
        // background to foreground
        const subscription = AppState.addEventListener(
            'change',
            nextAppState => {
                if (
                    appStateRef.current.match(/inactive|background/) &&
                    nextAppState === 'active'
                ) {
                    dispatch(refreshFederations(fedimint))
                    dispatch(refreshCommunities(fedimint))
                }
                appStateRef.current = nextAppState
            },
        )
        return () => subscription.remove()
    }, [dispatch, fedimint])

    const style = styles(
        theme,
        insets,
        Math.min(fontScale, MAX_TABS_FONT_SCALE),
    )

    return (
        <>
            <Tab.Navigator
                initialRouteName={
                    route.params?.initialRouteName ??
                    tabToSceenMap[lastUsedTab] ??
                    'Home'
                }
                id={TABS_NAVIGATOR_ID}
                screenOptions={({ route: screenRoute }) => ({
                    freezeOnBlur: true,
                    tabBarButton: props => {
                        switch (screenRoute.name) {
                            case 'Home':
                            case 'Chat':
                            case 'Mods':
                            case 'Wallet':
                                return (
                                    <TabBarButton
                                        {...props}
                                        pressedStyle={style.tabBarButtonPressed}
                                    />
                                )
                            default:
                                return null
                        }
                    },
                    tabBarIcon: ({ focused }) => {
                        const svgImageProps = {
                            maxFontSizeMultiplier: MAX_TABS_FONT_SCALE,
                            containerStyle: style.tabBarIconContainer,
                            color: focused
                                ? theme.colors.primary
                                : theme.colors.primaryLight,
                        }
                        switch (screenRoute.name) {
                            case 'Home':
                                return (
                                    <SvgImage
                                        name={
                                            focused
                                                ? 'CommunityFilled'
                                                : 'Community'
                                        }
                                        {...svgImageProps}
                                    />
                                )
                            case 'Chat':
                                return (
                                    <View style={style.tabIconBadgeContainer}>
                                        <SvgImage
                                            name={
                                                focused ? 'ChatFilled' : 'Chat'
                                            }
                                            {...svgImageProps}
                                        />
                                        {hasUnreadMessages && (
                                            <View
                                                style={style.tabUnreadIndicator}
                                            />
                                        )}
                                    </View>
                                )
                            case 'Mods':
                                return (
                                    <View style={style.tabIconBadgeContainer}>
                                        <SvgImage
                                            name={
                                                focused ? 'AppsFilled' : 'Apps'
                                            }
                                            {...svgImageProps}
                                        />
                                        {zendeskMsgCount > 0 && (
                                            <View
                                                style={style.tabUnreadIndicator}
                                            />
                                        )}
                                    </View>
                                )
                            case 'Wallet':
                                return (
                                    <SvgImage
                                        name={
                                            focused ? 'WalletFilled' : 'Wallet'
                                        }
                                        {...svgImageProps}
                                    />
                                )
                            default:
                                return null
                        }
                    },
                    tabBarShowLabel: true,
                    tabBarLabelStyle: {
                        ...style.tabBarLabel,
                        ...theme.components.Text.style,
                    },
                    tabBarIconStyle:
                        screenRoute.name === 'Scan'
                            ? undefined
                            : style.tabBarIcon,
                    tabBarActiveTintColor: theme.colors.primary,
                    tabBarInactiveTintColor: theme.colors.primaryLight,
                    tabBarBackground: () => (
                        <GradientFill
                            backgroundColor={theme.colors.secondary}
                        />
                    ),
                    tabBarStyle: style.tabBar,
                    tabBarItemStyle: style.tabBarItem,
                    headerTitleStyle: theme.components.Text.style,
                })}>
                <Tab.Screen
                    name="Wallet"
                    component={Wallet}
                    listeners={({ navigation }) => ({
                        focus: () => setShouldShowBackupReminder(true),
                        tabPress: event => {
                            if (
                                !navigation.isFocused() ||
                                loadedFederations.length < 2
                            ) {
                                return
                            }

                            event.preventDefault()
                            setWalletOverlayOpen(true)
                        },
                    })}
                    options={() => ({
                        tabBarTestID: 'WalletTabButton',
                        title: t('words.wallet'),
                        header: () => (
                            <WalletHeader
                                onOpenSelectWalletOverlay={() =>
                                    setWalletOverlayOpen(true)
                                }
                            />
                        ),
                    })}
                />
                <Tab.Screen
                    name="Chat"
                    component={ChatScreen}
                    options={() => ({
                        tabBarTestID: 'ChatTabButton',
                        title: t('words.chat'),
                        header: () => <ChatHeader />,
                    })}
                />
                <Tab.Screen
                    name="Scan"
                    options={({ navigation }) => ({
                        tabBarTestID: 'ScanTabButton',
                        tabBarLabel: t('phrases.scan-slash-paste'),
                        tabBarActiveTintColor: theme.colors.darkGrey,
                        tabBarInactiveTintColor: theme.colors.darkGrey,
                        tabBarButton: props => (
                            <TabBarButton
                                {...props}
                                onPress={() =>
                                    navigation.navigate('OmniScanner')
                                }
                                pressedStyle={style.tabBarButtonPressed}
                            />
                        ),
                        tabBarIcon: () => (
                            <GradientView
                                variant="black"
                                style={style.scanButton}>
                                <SvgImage
                                    name="Scan"
                                    color={theme.colors.white}
                                    size={24}
                                />
                            </GradientView>
                        ),
                    })}>
                    {() => null}
                </Tab.Screen>
                <Tab.Screen
                    name="Mods"
                    component={Mods}
                    options={() => ({
                        tabBarTestID: 'ModsTabButton',
                        title: t('words.mods'),
                        headerShown: false, // this allows us to draw over the header with tooltips
                    })}
                />
                <Tab.Screen
                    name="Home"
                    listeners={({ navigation }) => ({
                        focus: () => setShouldShowBackupReminder(true),
                        tabPress: event => {
                            if (
                                !navigation.isFocused() ||
                                communities.length < 2
                            ) {
                                return
                            }

                            event.preventDefault()
                            setCommunitiesOverlayOpen(true)
                        },
                    })}
                    options={() => ({
                        tabBarTestID: 'HomeTabButton',
                        title: t('words.spaces'),
                        header: () => (
                            <HomeHeader
                                onOpenCommunitiesOverlay={() =>
                                    setCommunitiesOverlayOpen(true)
                                }
                            />
                        ),
                    })}>
                    {props => <Home {...props} />}
                </Tab.Screen>
            </Tab.Navigator>
            <SelectWalletOverlay
                open={walletOverlayOpen}
                onDismiss={() => setWalletOverlayOpen(false)}
            />
            <CommunitiesOverlay
                open={communitiesOverlayOpen}
                onOpenChange={setCommunitiesOverlayOpen}
            />
            <StabilityPoolMonitorManager />
            <PersonalBackupReminderOverlay
                open={shouldShowBackupReminder}
                onDismiss={() => setShouldShowBackupReminder(false)}
            />
        </>
    )
}

const styles = (theme: Theme, insets: EdgeInsets, fontScale: number) => {
    // Tab bar height must be a fixed value due to its internal logic, but the height
    // is affected by fontScale, so we need to calculate it manually.
    const itemPadding = theme.spacing.sm
    const iconSize = theme.sizes.sm * getIconSizeMultiplier(fontScale)
    const iconLabelGap = theme.spacing.sm
    const fontSize = fediTheme.fontSizes.small * fontScale
    const labelBottomPadding =
        Platform.OS === 'android' ? theme.spacing.sm : theme.spacing.xxs
    const tabBarHeight =
        itemPadding * 2 +
        iconLabelGap +
        iconSize +
        fontSize +
        labelBottomPadding

    return StyleSheet.create({
        tabBar: {
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            height: tabBarHeight + insets.bottom,
            overflow: 'visible',
            paddingHorizontal: theme.spacing.xs,
        },
        scanButton: {
            borderWidth: 3,
            borderColor: theme.colors.white,
            position: 'absolute',
            top: -30,
            height: 62,
            width: 62,
            borderRadius: 1024,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        tabBarIconContainer: {},
        tabIconBadgeContainer: {
            position: 'relative',
            width: iconSize,
            height: iconSize,
        },
        tabUnreadIndicator: {
            position: 'absolute',
            top: -3,
            right: -3,
            backgroundColor: theme.colors.red,
            borderWidth: 2,
            borderColor: theme.colors.secondary,
            width: 12,
            height: 12,
            borderRadius: 6,
        },
        tabBarIcon: {
            flex: 0,
            height: iconSize,
            marginBottom: theme.spacing.sm,
        },
        tabBarItem: {},
        tabBarLabel: {
            fontSize: fediTheme.fontSizes.small,
            paddingBottom: labelBottomPadding,
        },
        disabledIcon: {
            opacity: 0.2,
            backgroundColor: theme.colors.grey,
        },
        row: {
            flexDirection: 'row',
        },
        tabBarButtonPressed: {
            backgroundColor: theme.colors.primary05,
            borderRadius: theme.borders.defaultRadius,
        },
    })
}

const gradientFillStyles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'visible',
    },
    fade: {
        position: 'absolute',
        top: -TAB_BAR_FADE_HEIGHT,
        left: 0,
        right: 0,
        height: TAB_BAR_FADE_HEIGHT,
    },
    fill: {
        ...StyleSheet.absoluteFillObject,
    },
})

export default TabsNavigator
