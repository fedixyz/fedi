// native/tests/setup/jest.setup.mocks.ts

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

jest.mock('uuid', () => ({
    v4: () => 'mocked-uuid',
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

jest.mock('react-native', () => ({
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

jest.mock('buffer', () => {
    const actual = jest.requireActual('buffer')
    return {
        Buffer: actual.Buffer,
    }
})

jest.mock('react-native-quick-base64', () => ({
    QuickBase64: {
        toBase64: jest.fn(() => 'mocked-base64'),
        fromBase64: jest.fn(() => new Uint8Array([1, 2, 3])),
    },
}))

jest.mock('js-lnurl', () => ({
    getParams: jest.fn(() => Promise.resolve({})),
}))
