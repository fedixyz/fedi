import {
    InjectionMessageHandlers,
    InjectionMessageType,
    makeWebViewMessageHandler,
} from '@fedi/injections'

import { MiniAppSeedRequestController } from '../../../utils/miniAppSeed'

const seed = '00112233445566778899aabbccddeeff'

const makeHarness = (overrides?: {
    getCurrentUrl?: () => string
    isEnabled?: () => boolean
    requirePin?: () => Promise<void>
    requestConsent?: () => Promise<boolean>
    getSeed?: () => Promise<{ seed: string }>
}) => {
    const webview = {
        injectJavaScript: jest.fn(),
        postMessage: jest.fn(),
    }
    const controller = new MiniAppSeedRequestController()
    const dependencies = {
        getCurrentUrl:
            overrides?.getCurrentUrl ?? (() => 'https://example.com/page'),
        isEnabled: overrides?.isEnabled ?? (() => true),
        requirePin:
            overrides?.requirePin ?? jest.fn().mockResolvedValue(undefined),
        requestConsent:
            overrides?.requestConsent ?? jest.fn().mockResolvedValue(true),
        getSeed: overrides?.getSeed ?? jest.fn().mockResolvedValue({ seed }),
    }
    const onMessage = makeWebViewMessageHandler({ current: webview }, [], {
        [InjectionMessageType.fedi_getSeed]: (data: void) =>
            controller.handle(data, dependencies),
    } as unknown as InjectionMessageHandlers)
    const sendRequest = (id: number) =>
        onMessage({
            nativeEvent: {
                data: JSON.stringify({
                    id,
                    type: InjectionMessageType.fedi_getSeed,
                    data: undefined,
                }),
            },
        })

    return { dependencies, sendRequest, webview }
}

describe('MiniAppSeedRequestController', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })
    it('should gate, confirm, and derive a seed for the requesting page', async () => {
        const calls: string[] = []
        const requirePin = jest.fn().mockImplementation(async () => {
            calls.push('pin')
        })
        const requestConsent = jest
            .fn()
            .mockImplementation(async (request: { origin: string }) => {
                calls.push('consent')
                expect(request).toEqual({ origin: 'https://example.com' })
                return true
            })
        const getSeed = jest
            .fn()
            .mockImplementation(async (request: { url: string }) => {
                calls.push('seed')
                expect(request).toEqual({
                    url: 'https://example.com/page',
                })
                return { seed }
            })
        const harness = makeHarness({
            requirePin,
            requestConsent,
            getSeed,
        })

        await harness.sendRequest(1)

        expect(calls).toEqual(['pin', 'consent', 'seed'])
        expect(harness.webview.injectJavaScript).toHaveBeenCalledWith(
            expect.stringMatching(new RegExp(`"id":1.*"seed":"${seed}"`, 's')),
        )
    })

    it('should reject raw requests while the feature flag is disabled', async () => {
        const harness = makeHarness({ isEnabled: () => false })

        await harness.sendRequest(1)

        expect(harness.webview.injectJavaScript).toHaveBeenCalledWith(
            expect.stringContaining('"error"'),
        )
        expect(harness.dependencies.requestConsent).not.toHaveBeenCalled()
        expect(harness.dependencies.getSeed).not.toHaveBeenCalled()
        expect(harness.dependencies.requirePin).not.toHaveBeenCalled()
    })

    it('should send an error when consent is denied', async () => {
        const harness = makeHarness({
            requestConsent: jest.fn().mockResolvedValue(false),
        })

        await harness.sendRequest(1)

        expect(harness.webview.injectJavaScript).toHaveBeenCalledWith(
            expect.stringContaining('"error"'),
        )
        expect(harness.dependencies.getSeed).not.toHaveBeenCalled()
    })

    it('should reject a duplicate request while consent is pending', async () => {
        let denyFirstRequest: ((approved: boolean) => void) | undefined
        const consent = new Promise<boolean>(resolve => {
            denyFirstRequest = resolve
        })
        const harness = makeHarness({ requestConsent: () => consent })

        const firstRequest = harness.sendRequest(1)
        await harness.sendRequest(2)

        expect(harness.webview.injectJavaScript).toHaveBeenCalledWith(
            expect.stringMatching(/"id":2.*"error"/s),
        )

        denyFirstRequest?.(false)
        await firstRequest
    })
    it('should allow another request after the PIN gate is canceled', async () => {
        const requirePin = jest
            .fn()
            .mockRejectedValueOnce(new Error('PIN entry canceled'))
            .mockResolvedValueOnce(undefined)
        const harness = makeHarness({ requirePin })

        await harness.sendRequest(1)
        await harness.sendRequest(2)

        expect(requirePin).toHaveBeenCalledTimes(2)
        expect(harness.webview.injectJavaScript).toHaveBeenLastCalledWith(
            expect.stringContaining(`"seed":"${seed}"`),
        )
    })

    it('should drop the response when the origin changes in flight', async () => {
        let currentUrl = 'https://example.com/page'
        const harness = makeHarness({
            getCurrentUrl: () => currentUrl,
            getSeed: jest.fn().mockImplementation(async () => {
                currentUrl = 'https://other.example/page'
                return { seed }
            }),
        })

        await harness.sendRequest(1)

        expect(harness.webview.injectJavaScript).not.toHaveBeenCalled()
    })
    it('should deliver the response after a same-origin navigation', async () => {
        let currentUrl = 'https://example.com/page'
        const harness = makeHarness({
            getCurrentUrl: () => currentUrl,
            getSeed: jest.fn().mockImplementation(async () => {
                currentUrl = 'https://example.com/other#/route'
                return { seed }
            }),
        })

        await harness.sendRequest(1)

        expect(harness.webview.injectJavaScript).toHaveBeenCalledWith(
            expect.stringContaining(`"seed":"${seed}"`),
        )
    })
})
