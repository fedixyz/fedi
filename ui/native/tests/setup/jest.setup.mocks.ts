import { I18nextProvider } from 'react-i18next'

import i18n from '@fedi/native/localization/i18n'

import { themeDefaults } from '../../styles/theme'

// Mock the fetch request in the `fetchCurrencyPrices` thunk only
const realFetch = global.fetch
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
jest.mock('@fedi/native/assets/images/svgs', () => {
    const actual = jest.requireActual('@fedi/native/assets/images/svgs')
    return Object.keys(actual).reduce((acc: any, key: string) => {
        acc[key] = jest.fn()
        return acc
    }, {} as any)
})

jest.mock('@notifee/react-native', () => ({
    getInitialNotification: jest.fn().mockResolvedValue(undefined),
    onForegroundEvent: jest.fn(() => () => undefined),
    EventType: { PRESS: 'PRESS' },
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
    unlink: jest.fn(),
    exists: jest.fn(() => Promise.resolve(true)),
    mkdir: jest.fn(),
    DocumentDirectoryPath: '/mock/documents',
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

// mocks for commonly used react native components
// add more here as needed
jest.mock('react-native', () => ({
    ActivityIndicator: jest.requireActual('react-native').ActivityIndicator,
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
    useSharedValue: jest.fn(),
    useAnimatedStyle: jest.fn(),
    withSequence: jest.fn(),
    withTiming: jest.fn(),
    View: jest.requireActual('react-native').View,
}))

// mock a theme object with values for colors, spacing, etc
export const mockTheme = {
    ...themeDefaults,
}

jest.mock('@rneui/themed', () => ({
    createTheme: jest.fn(),
    ThemeProvider: jest.requireActual('@rneui/themed').ThemeProvider,
    Button: jest.requireActual('@rneui/themed').Button,
    Input: jest.requireActual('@rneui/themed').Input,
    Text: jest.requireActual('@rneui/themed').Text,
    Image: jest.requireActual('@rneui/themed').Image,
    Overlay: jest.requireActual('@rneui/themed').Overlay,
    Switch: jest.requireActual('@rneui/themed').Switch,
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
    setOptions: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
}
export const mockRoute = {}
jest.mock('@react-navigation/native', () => ({
    useNavigation: jest.fn(() => mockNavigation),
    useRoute: jest.fn(() => mockRoute),
    useIsFocused: jest.fn(() => true),
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
}))

jest.mock('react-native-gesture-handler', () => ({
    ScrollView: jest.requireActual('react-native').ScrollView,
}))

jest.mock('react-native-modal', () => jest.requireActual('react-native').Modal)

jest.mock('@react-navigation/elements', () => ({
    useHeaderHeight: jest.fn(() => 100),
}))

jest.mock('@react-native-clipboard/clipboard', () => ({
    getString: jest.fn(),
    setString: jest.fn(),
}))

jest.mock('react-native-vision-camera', () => ({
    Camera: jest.requireActual('react-native').View,
    useCodeScanner: jest.fn(() => ({
        scan: jest.fn(),
    })),
    useCameraDevice: jest.fn(() => ({
        id: 'back',
        name: 'Back Camera',
        position: 'back',
    })),
}))
