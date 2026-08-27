import { configure } from '@testing-library/react-native'
import { I18nextProvider } from 'react-i18next'

import i18n from '@fedi/native/localization/i18n'

import { themeDefaults } from '../../styles/theme'

// default timeout for waitFor functions
// currently at 30 seconds since there seems to be some bottleneck
// where we sometimes have to wait a long time to assert matrix state
configure({ asyncUtilTimeout: 60000 })

const realFetch = global.fetch
// eslint-disable-next-line @typescript-eslint/no-require-imports
const federationsData = require('../../../web/public/meta-federations.json')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const autoselectData = require('../../../web/public/meta-autoselect-federations.json')

global.fetch = jest.fn((url, options) => {
    if (url.includes('price-feed.dev.fedibtc.com')) {
        return Promise.resolve({
            json: () =>
                Promise.resolve({
                    prices: {
                        'BTC/USD': {
                            rate: 100000, // 0.1M
                            timestamp: new Date().toString(),
                        },
                    },
                }),
        })
    }

    if (url.includes('/api/federations')) {
        return Promise.resolve({
            json: () => Promise.resolve(federationsData),
        })
    }

    if (url.includes('/api/autoselect-federations')) {
        return Promise.resolve({
            json: () => Promise.resolve(autoselectData),
        })
    }

    return realFetch(url, options)
}) as unknown as jest.Mocked<typeof global.fetch>

jest.mock('buffer', () => {
    const actual = jest.requireActual('buffer')
    return {
        Buffer: actual.Buffer,
    }
})

jest.mock('js-lnurl', () => ({
    getParams: jest.fn(() => Promise.resolve({})),
}))

jest.mock('react-native-mmkv', () => {
    const mockMMKV = {
        set: jest.fn(),
        getString: jest.fn(),
        getNumber: jest.fn(),
        getBoolean: jest.fn(),
        contains: jest.fn(),
        delete: jest.fn(),
        getAllKeys: jest.fn(() => []),
        clearAll: jest.fn(),
        trim: jest.fn(),
    }
    return {
        MMKV: jest.fn(() => mockMMKV),
    }
})

// Mock native SVGs to return mock functions for every key
jest.mock('@fedi/common/assets/svgs', () => {
    const actual = jest.requireActual('@fedi/common/assets/svgs')
    return Object.keys(actual).reduce((acc: any, key: string) => {
        acc[key] = jest.fn()
        return acc
    }, {} as any)
})

jest.mock('@notifee/react-native', () => ({
    getInitialNotification: jest.fn().mockResolvedValue(undefined),
    onForegroundEvent: jest.fn(() => () => undefined),
    displayNotification: jest.fn().mockResolvedValue(undefined),
    incrementBadgeCount: jest.fn().mockResolvedValue(undefined),
    getBadgeCount: jest.fn().mockResolvedValue(1),
    EventType: { PRESS: 'PRESS' },
    AndroidGroupAlertBehavior: { SUMMARY: 'summary' },
}))

jest.mock('@react-native-firebase/messaging', () => ({
    default: {
        onMessage: jest.fn(() => () => undefined),
        setBackgroundMessageHandler: jest.fn(),
    },
    firebase: {
        app: jest.fn(),
    },
}))

jest.mock('react-native-device-info', () => ({
    getVersion: jest.fn(() => '1.0.0'),
    getBuildNumber: jest.fn(() => '100'),
    getSystemName: jest.fn(() => 'iOS'),
    getSystemVersion: jest.fn(() => '14.4'),
    getDeviceId: jest.fn(() => 'iPhone12,1'),
    getDeviceName: jest.fn(() => 'Test iPhone'),
    getBundleId: jest.fn(() => ''),
    hasNotch: jest.fn(() => false),
}))

jest.mock('react-native-zendesk-messaging', () => ({
    initialize: jest.fn(),
    showMessaging: jest.fn(),
    closeMessaging: jest.fn(),
}))

jest.mock('@react-native-community/netinfo', () => ({
    addEventListener: jest.fn(() => () => undefined),
    fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
}))

jest.mock('react-native-fs', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
    copyFile: jest.fn(),
    unlink: jest.fn(),
    exists: jest.fn(() => Promise.resolve(true)),
    mkdir: jest.fn(),
    DocumentDirectoryPath: '/mock/documents',
    TemporaryDirectoryPath: '/tmp',
}))

jest.mock('react-native-localize', () => ({
    getNumberFormatSettings: jest.fn(() => ({
        decimalSeparator: '.',
        groupingSeparator: ',',
    })),
    getTimeZone: jest.fn(() => 'UTC'),
    getLocales: jest.fn(() => [
        {
            countryCode: 'US',
            languageTag: 'en-US',
            languageCode: 'en',
            isRTL: false,
        },
    ]),
    getCountry: jest.fn(() => 'US'),
    getCalendar: jest.fn(() => 'gregorian'),
    getTemperatureUnit: jest.fn(() => 'celsius'),
    uses24HourClock: jest.fn(() => true),
    usesMetricSystem: jest.fn(() => true),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    findBestLanguageTag: jest.fn(() => ({
        languageTag: 'en-US',
        isRTL: false,
    })),
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        setItem: jest.fn(),
        getItem: jest.fn(() => Promise.resolve(null)),
        removeItem: jest.fn(),
        clear: jest.fn(),
        getAllKeys: jest.fn(() => Promise.resolve([])),
    },
}))

jest.mock('react-native-quick-crypto', () => ({
    createHash: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => 'mocked-hash'),
    })),
    createHmac: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => 'mocked-hmac'),
    })),
    pbkdf2Sync: jest.fn(() => Buffer.from('mocked-key')),
}))

jest.mock('@fedi/common/utils/log', () => ({
    makeLog: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}))

type AppStateStatus = 'active' | 'background' | 'inactive'
type AppStateListener = (status: AppStateStatus) => void

// `mock`-prefixed: jest forbids a mock factory from touching any other
// out-of-scope binding, however it is declared
const mockAppStateListeners = new Set<AppStateListener>()
const mockAppStateValue = { current: 'active' as AppStateStatus }

/**
 * Drives `AppState` as the OS would, for code that recovers on resume.
 *
 * Backgrounding is not something a test can provoke by rendering, and it is
 * exactly the condition that breaks event-driven screens — a suspended JS
 * thread misses the one event it was waiting for. So it is drivable here,
 * rather than left to a component that fakes being asleep.
 */
export const mockAppState = {
    background() {
        mockAppStateValue.current = 'background'
        mockAppStateListeners.forEach(listener => listener('background'))
    },
    foreground() {
        mockAppStateValue.current = 'active'
        mockAppStateListeners.forEach(listener => listener('active'))
    },
    /** Every suite starts in the foreground, with nobody listening. */
    reset() {
        mockAppStateValue.current = 'active'
        mockAppStateListeners.clear()
    },
}

type BackHandlerListener = () => boolean

// `mock`-prefixed: jest forbids a mock factory from touching any other
// out-of-scope binding, however it is declared
const mockBackHandlerListeners: BackHandlerListener[] = []

/**
 * Presses Android's hardware back button, as the OS would.
 *
 * A screen can bind this to something other than popping the stack, and no
 * amount of rendering provokes it, so it is drivable here. Listeners run
 * newest first and stop at the first one that claims the press — the same
 * order `BackHandler` uses, which is what lets a focused screen override the
 * one beneath it.
 *
 * Returns whether any listener handled it.
 */
export const mockHardwareBack = {
    press() {
        for (let i = mockBackHandlerListeners.length - 1; i >= 0; i--) {
            if (mockBackHandlerListeners[i]()) return true
        }
        return false
    },
    /** Every suite starts with nobody listening. */
    reset() {
        mockBackHandlerListeners.length = 0
    },
}

// mocks for commonly used react native components
// add more here as needed
jest.mock('react-native', () => ({
    BackHandler: {
        addEventListener: (event: string, listener: BackHandlerListener) => {
            if (event === 'hardwareBackPress')
                mockBackHandlerListeners.push(listener)
            return {
                remove: () => {
                    const at = mockBackHandlerListeners.indexOf(listener)
                    if (at !== -1) mockBackHandlerListeners.splice(at, 1)
                },
            }
        },
    },
    AppState: {
        get currentState() {
            return mockAppStateValue.current
        },
        addEventListener: (event: string, listener: AppStateListener) => {
            if (event === 'change') mockAppStateListeners.add(listener)
            return { remove: () => mockAppStateListeners.delete(listener) }
        },
    },
    // react-redux calls this to batch subscriber notifications; without it any
    // dispatch after mount throws "batch is not a function"
    unstable_batchedUpdates:
        jest.requireActual('react-native').unstable_batchedUpdates,
    ActivityIndicator: jest.requireActual('react-native').ActivityIndicator,
    Alert: {
        alert: jest.fn(),
    },
    Appearance: {
        getColorScheme: jest.fn(() => 'light'),
    },
    Animated: jest.requireActual('react-native').Animated,
    Button: jest.requireActual('react-native').Button,
    Dimensions: jest.requireActual('react-native').Dimensions,
    Easing: jest.requireActual('react-native').Easing,
    FlatList: jest.requireActual('react-native').FlatList,
    Image: jest.requireActual('react-native').Image,
    ImageBackground: jest.requireActual('react-native').ImageBackground,
    Insets: jest.requireActual('react-native').Insets,
    InteractionManager: jest.requireActual('react-native').InteractionManager,
    Keyboard: jest.requireActual('react-native').Keyboard,
    KeyboardEvent: jest.requireActual('react-native').KeyboardEvent,
    KeyboardAvoidingView:
        jest.requireActual('react-native').KeyboardAvoidingView,
    Modal: jest.requireActual('react-native').Modal,
    PanResponder: jest.requireActual('react-native').PanResponder,
    Pressable: jest.requireActual('react-native').Pressable,
    ScrollView: jest.requireActual('react-native').ScrollView,
    StatusBar: jest.requireActual('react-native').StatusBar,
    StyleSheet: jest.requireActual('react-native').StyleSheet,
    Switch: jest.requireActual('react-native').Switch,
    Text: jest.requireActual('react-native').Text,
    TextInput: jest.requireActual('react-native').TextInput,
    Touchable: jest.requireActual('react-native').Touchable,
    TouchableOpacity: jest.requireActual('react-native').TouchableOpacity,
    UIManager: jest.requireActual('react-native').UIManager,
    View: jest.requireActual('react-native').View,
    processColor: jest.requireActual('react-native').processColor,
    useWindowDimensions: jest.requireActual('react-native').useWindowDimensions,
    Platform: jest.requireActual('react-native').Platform,
    I18nManager: jest.requireActual('react-native').I18nManager,
    Linking: {
        openURL: jest.fn(),
        getInitialURL: jest.fn(),
        addEventListener: jest.fn(() => ({
            remove: jest.fn(),
        })),
    },
    NativeModules: {
        BridgeNativeEventEmitter: {},
        FedimintFfi: {},
    },
}))

jest.mock('react-native-modal', () => jest.requireActual('react-native').Modal)

jest.mock('react-native-gesture-handler', () => ({
    // Use React Native's ScrollView instead
    // because react-native-gesture-handler uses native modules
    // (they don't exist in the Jest environment)
    ScrollView: jest.requireActual('react-native').ScrollView,
}))

jest.mock('react-native-reanimated', () => ({
    // return a writable object so components that assign `.value` in effects
    // (e.g. success animations that always run) don't crash under test
    useSharedValue: jest.fn(initial => ({ value: initial })),
    useAnimatedStyle: jest.fn(),
    withSequence: jest.fn(),
    withTiming: jest.fn(value => value),
    withDelay: jest.fn((_delay, value) => value),
    withRepeat: jest.fn(value => value),
    FadeIn: {},
    FadeOut: {},
    View: jest.requireActual('react-native').View,
    Easing: jest.requireActual('react-native').Easing,
}))

// mock a theme object with values for colors, spacing, etc
export const mockTheme = {
    ...themeDefaults,
    // mirrors the `Header` block in `ui/native/styles/theme.ts`. The real shape
    // is needed rather than `{}` because screens that render the shared
    // `Header` themselves read these back — `containerStyle.borderBottomColor`
    // in particular — instead of only ever getting it from the navigator
    components: {
        Header: {
            containerStyle: {
                paddingHorizontal: themeDefaults.spacing.lg,
                borderBottomColor: themeDefaults.colors.secondary,
                paddingVertical: 0,
            },
            leftContainerStyle: {
                flex: 1,
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'center',
            },
            centerContainerStyle: {
                flex: 0,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 36,
            },
            rightContainerStyle: {
                flex: 1,
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'center',
            },
        },
    },
}

jest.mock('@rneui/themed', () => ({
    createTheme: jest.fn(),
    ThemeProvider: jest.requireActual('@rneui/themed').ThemeProvider,
    Button: jest.requireActual('@rneui/themed').Button,
    CheckBox: jest.requireActual('@rneui/themed').CheckBox,
    Input: jest.requireActual('@rneui/themed').Input,
    Text: jest.requireActual('@rneui/themed').Text,
    Image: jest.requireActual('@rneui/themed').Image,
    Overlay: jest.requireActual('@rneui/themed').Overlay,
    Switch: jest.requireActual('@rneui/themed').Switch,
    Header: jest.requireActual('@rneui/themed').Header,
    Tooltip: jest.requireActual('@rneui/themed').Tooltip,
    useTheme: () => ({
        theme: mockTheme,
    }),
}))

jest.mock('react-native-gesture-handler', () => ({
    // Use React Native's ScrollView instead
    // because react-native-gesture-handler uses native modules
    // (they don't exist in the Jest environment)
    ScrollView: jest.requireActual('react-native').ScrollView,
}))

// mock so the navigation hook returns a mock function
export const mockNavigation = {
    navigate: jest.fn(),
    push: jest.fn(),
    reset: jest.fn(),
    setOptions: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn(() => {}),
}
export const mockRoute = {}

type FocusEffectCallback = () => void | (() => void)
const mockFocusEffectEntries = new Map<
    FocusEffectCallback,
    void | (() => void)
>()
/** Drives useFocusEffect callbacks as a navigation container would. */
export const mockScreenFocus = {
    blur() {
        mockFocusEffectEntries.forEach((cleanup, callback) => {
            if (typeof cleanup === 'function') cleanup()
            mockFocusEffectEntries.set(callback, undefined)
        })
    },
    focus() {
        mockFocusEffectEntries.forEach((_, callback) => {
            mockFocusEffectEntries.set(callback, callback())
        })
    },
}

jest.mock('@react-navigation/native', () => ({
    useNavigation: jest.fn(() => mockNavigation),
    useRoute: jest.fn(() => mockRoute),
    useIsFocused: jest.fn(() => true),
    // behaves as focused-on-mount / blurred-on-unmount; tests can also drive
    // an explicit blur/refocus through mockScreenFocus without remounting,
    // which the test renderer does not tolerate twice in one test
    useFocusEffect: (callback: () => void | (() => void)) =>
        jest.requireActual('react').useEffect(() => {
            mockFocusEffectEntries.set(callback, callback())
            return () => {
                const cleanup = mockFocusEffectEntries.get(callback)
                mockFocusEffectEntries.delete(callback)
                if (typeof cleanup === 'function') cleanup()
            }
        }, [callback]),
    CommonActions: jest.requireActual('@react-navigation/native').CommonActions,
}))

// mock i18n provider that uses a real i18n instance for testing
export const I18nProvider = ({ children }: any) => {
    const React = jest.requireActual('react')
    return React.createElement(I18nextProvider, { i18n }, children)
}

jest.mock('react-native-quick-base64', () => ({
    QuickBase64: {
        toBase64: jest.fn(() => 'mocked-base64'),
        fromBase64: jest.fn(() => new Uint8Array([1, 2, 3])),
    },
}))

jest.mock('react-native-permissions', () => ({
    PERMISSIONS: {
        ANDROID: {
            CAMERA: 'android.permission.CAMERA',
            RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
            READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
            WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
        },
        IOS: {
            CAMERA: 'ios.permission.CAMERA',
            MICROPHONE: 'ios.permission.MICROPHONE',
            PHOTO_LIBRARY: 'ios.permission.PHOTO_LIBRARY',
        },
    },
    RESULTS: {
        UNAVAILABLE: 'unavailable',
        DENIED: 'denied',
        LIMITED: 'limited',
        GRANTED: 'granted',
        BLOCKED: 'blocked',
    },
    check: jest.fn(() => Promise.resolve('granted')),
    request: jest.fn(() => Promise.resolve('granted')),
    requestMultiple: jest.fn(() => Promise.resolve({})),
    checkMultiple: jest.fn(() => Promise.resolve({})),
    checkNotifications: jest.fn(() =>
        Promise.resolve({ status: 'granted', settings: {} }),
    ),
    requestNotifications: jest.fn(() =>
        Promise.resolve({ status: 'granted', settings: {} }),
    ),
    openSettings: jest.fn(() => Promise.resolve()),
}))

jest.mock('react-native-safe-area-context', () => {
    const React = jest.requireActual('react')
    const { View } = jest.requireActual('react-native')
    return {
        SafeAreaProvider: ({ children }: any) => {
            return React.createElement(React.Fragment, null, children)
        },
        SafeAreaView: ({ children, ...props }: any) => {
            return React.createElement(View, props, children)
        },
        useSafeAreaInsets: () => ({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        }),
        useSafeAreaFrame: () => ({
            x: 0,
            y: 0,
            width: 375,
            height: 812,
        }),
    }
})

jest.mock('react-native-share', () => ({
    open: jest.fn(),
}))

jest.mock('rn-fetch-blob', () => ({
    fs: {
        dirs: {
            DocumentDir: '/mock/documents',
        },
        readFile: jest.fn(),
        writeFile: jest.fn(),
        unlink: jest.fn(),
    },
    RNFetchBlob: {
        fs: {
            readFile: jest.fn(),
            writeFile: jest.fn(),
            unlink: jest.fn(),
        },
    },
}))

jest.mock('@react-native-documents/picker', () => ({
    DocumentPickerOptions: {},
    DocumentPickerResponse: {},
    pick: jest.fn(),
    keepLocalCopy: jest.fn(),
    types: {
        allFiles: '*/*',
        images: 'image/*',
        plainText: 'text/plain',
        audio: 'audio/*',
        pdf: 'application/pdf',
        zip: 'application/zip',
        csv: 'text/csv',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
}))

jest.mock('react-native-gesture-handler', () => ({
    ScrollView: jest.requireActual('react-native').ScrollView,
}))

// the qrcode package reaches for node's zlib through pngjs, which the RN
// test environment has no shim for; screens only need a value to render
jest.mock('@fedi/common/utils/qrcode', () => ({
    renderStyledQrSvg: jest.fn(() => '<svg />'),
}))

// native module with no JS fallback; screens only need it to render
jest.mock('react-native-view-shot', () => ({
    __esModule: true,
    default: 'ViewShot',
    captureRef: jest.fn(),
}))

jest.mock('react-native-modal', () => jest.requireActual('react-native').Modal)

jest.mock('@react-navigation/elements', () => ({
    useHeaderHeight: jest.fn(() => 100),
}))

jest.mock('@react-native-clipboard/clipboard', () => ({
    getString: jest.fn(),
    setString: jest.fn(),
}))

jest.mock('@react-native-camera-roll/camera-roll', () => ({
    CameraRoll: {
        saveAsset: jest.fn().mockResolvedValue(undefined),
        getPhotos: jest.fn().mockResolvedValue({ edges: [] }),
    },
}))

jest.mock('react-native-image-picker', () => ({
    launchCamera: jest.fn().mockResolvedValue({ assets: [] }),
    launchImageLibrary: jest.fn().mockResolvedValue({ assets: [] }),
}))

jest.mock('react-native-share', () => ({
    open: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('react-native-vision-camera', () => {
    const { View } = jest.requireActual('react-native')

    return {
        __esModule: true,
        Camera: View,
        useCodeScanner: jest.fn(() => ({ scan: jest.fn() })),
        useCameraDevice: jest.fn(() => ({
            id: 'back',
            name: 'Back Camera',
            position: 'back',
            formats: [
                {
                    video: true,
                    photo: true,
                    fps: [30],
                    width: 1920,
                    height: 1080,
                },
                {
                    video: true,
                    photo: false,
                    fps: [60],
                    width: 1280,
                    height: 720,
                },
            ],
        })),
    }
})

jest.mock('react-native-video', () => {
    const React = jest.requireActual('react')
    const { View } = jest.requireActual('react-native')

    const MockVideo = React.forwardRef((props: any, ref: any) =>
        React.createElement(View, { ...props, ref }),
    )

    return {
        __esModule: true,
        default: MockVideo,
    }
})

jest.mock('react-native-svg', () => ({
    SvgXml: jest.requireActual('react-native-svg').SvgXml,
    Svg: jest.requireActual('react-native-svg').Svg,
    // the wallet service progress spinner's ring
    Circle: jest.requireActual('react-native-svg').Circle,
    // masking primitives, used to cut the spotlight hole in the wallet service
    // tour's scrim
    Defs: jest.requireActual('react-native-svg').Defs,
    Mask: jest.requireActual('react-native-svg').Mask,
    Rect: jest.requireActual('react-native-svg').Rect,
    // the band that pans across a loading skeleton bar
    LinearGradient: jest.requireActual('react-native-svg').LinearGradient,
    Stop: jest.requireActual('react-native-svg').Stop,
}))

jest.mock('react-native-progress', () => ({
    Circle: jest.requireActual('react-native').View,
    Pie: jest.requireActual('react-native').View,
    Bar: jest.requireActual('react-native').View,
}))

export const mockToast = {
    show: jest.fn(),
    error: jest.fn(),
    close: jest.fn(),
}

jest.mock('@fedi/common/hooks/toast', () => ({
    useToast: () => mockToast,
}))
