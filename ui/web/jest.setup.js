import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'
import fetch from 'node-fetch'

// default timeout for waitFor functions
// currently at 30 seconds since there seems to be some bottleneck
// where we sometimes have to wait a long time to assert matrix state
configure({ asyncUtilTimeout: 60000 })

// Mock the fetch request in the `fetchCurrencyPrices` thunk only
const realFetch = fetch
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
})

Object.defineProperty(window, 'matchMedia', {
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
})

Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    value: jest.fn(),
})

Object.defineProperty(navigator, 'permissions', {
    writable: true,
    value: {
        query: jest.fn().mockResolvedValue({ state: 'granted' }),
    },
})

export const mockUseRouter = {
    pathname: '',
    asPath: '',
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    isReady: true,
}
jest.mock('next/router', () => ({
    useRouter: () => mockUseRouter,
}))

jest.mock('@fedi/web/src/components/QRScanner', () => ({
    QRScanner: ({ processing }) => (
        <div data-testid="qr-scanner-mock">
            {processing && <div>Processing...</div>}
        </div>
    ),
}))

jest.mock('@fedi/common/utils/log', () => ({
    makeLog: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
    }),
}))

jest.mock('@fedi/common/hooks/toast', () => ({
    useToast: () => ({
        error: jest.fn(),
        show: jest.fn(),
    }),
}))

global.URL.createObjectURL = jest.fn().mockImplementation(() => '/test-url')
global.URL.revokeObjectURL = jest.fn()

global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
}))

HTMLCanvasElement.prototype.getContext = jest.fn()
