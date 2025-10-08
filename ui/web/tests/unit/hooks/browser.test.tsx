import '@testing-library/jest-dom'
import { waitFor } from '@testing-library/react'

import { setupStore } from '@fedi/common/redux'

import { useIFrameListener } from '../../../src/hooks/browser'
import { AppState } from '../../../src/state/store'
import { renderHookWithProviders } from '../../utils/render'

jest.mock('../../../src/lib/bridge', () => ({
    fedimint: {
        decodeInvoice: () => ({
            paymentHash: 'hash',
            amount: 100000,
            fee: 0,
            description: 'desc',
            invoice: '12345',
        }),
        signNostrEvent: () => 'mock-sig',
    },
}))

const mockDispatch = jest.fn()
jest.mock('../../../src/hooks/store.ts', () => ({
    ...jest.requireActual('../../../src/hooks/store'),
    useAppDispatch: () => mockDispatch,
}))

const postMessageMock = jest.fn()

const fakeContentWindow = {
    postMessage: postMessageMock,
} as unknown

const iframeRef = {
    current: {
        contentWindow: fakeContentWindow,
    } as HTMLIFrameElement,
}

describe('/hooks/browser', () => {
    let store
    let state: AppState

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('When a nostr.getPublicKey message event occurs', () => {
        it('should send the nostr public key using postMessage', async () => {
            renderHookWithProviders(() => useIFrameListener(iframeRef), {
                preloadedState: {
                    environment: {
                        ...state.environment,
                        nostrNpub: {
                            hex: '36250e727c4e7782b9311232e306ab7d0905de173719f5149952244bbd41c677',
                            npub: 'npub1xcjsuunufemc9wf3zgewxp4t05ysthshxuvl29ye2gjyh02pcemsdcx2cc',
                        },
                    },
                },
            })

            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        event: 'nostr.getPublicKey',
                    },
                }),
            )

            await waitFor(() => {
                expect(
                    iframeRef?.current?.contentWindow?.postMessage,
                ).toHaveBeenCalledWith(
                    {
                        event: 'nostr.getPublicKey',
                        payload:
                            '36250e727c4e7782b9311232e306ab7d0905de173719f5149952244bbd41c677',
                    },
                    '*',
                )
            })
        })
    })

    describe('When a nostr.signEvent message event occurs', () => {
        it('should send signedEvent using postMessage', async () => {
            renderHookWithProviders(() => useIFrameListener(iframeRef), {
                preloadedState: {
                    environment: {
                        ...state.environment,
                        nostrNpub: {
                            hex: '36250e727c4e7782b9311232e306ab7d0905de173719f5149952244bbd41c677',
                            npub: 'npub1xcjsuunufemc9wf3zgewxp4t05ysthshxuvl29ye2gjyh02pcemsdcx2cc',
                        },
                    },
                },
            })

            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        event: 'nostr.signEvent',
                        payload: {
                            created_at: 1752678493,
                            kind: 22242,
                            content: 'Login to site',
                            tags: [],
                            pubkey: '36250e727c4e7782b9311232e306ab7d0905de173719f5149952244bbd41c677',
                        },
                    },
                }),
            )

            await waitFor(() => {
                expect(
                    iframeRef?.current?.contentWindow?.postMessage,
                ).toHaveBeenCalledWith(
                    {
                        event: 'nostr.signEvent',
                        payload: {
                            created_at: 1752678493,
                            kind: 22242,
                            content: 'Login to site',
                            tags: [],
                            pubkey: '36250e727c4e7782b9311232e306ab7d0905de173719f5149952244bbd41c677',
                            id: '7efcd603504ee6bc9aa3d5b8d3a0fd6bbe8cf4e3550fe40ac91851de7e6196ac',
                            sig: 'mock-sig',
                        },
                    },
                    '*',
                )
            })
        })
    })

    describe('When a webln.sendPayment message event occurs', () => {
        it('should dispatch decoded invoice', async () => {
            renderHookWithProviders(() => useIFrameListener(iframeRef))

            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        event: 'webln.sendPayment',
                        payload:
                            'lnbc117030n1p5q8s8app5d77zwec0cxlt3tkvcd54ftuvfyw2vgx3xzqxqf2e89vun4xfd23scqzyssp533suuayhvueuncy3n4pu0lk2n69ypfz6hxcvtutn6u3mf0jwjc4q9q7sqqqqqqqqqqqqqqqqqqqsqqqqqysgqdqhfehkgctwvys9qcted4jkuaqmqz9gxqyz5vqrzjqwryaup9lh50kkranzgcdnn2fgvx390wgj5jd07rwr3vxeje0glcllcs7fczgc5c5cqqqqlgqqqqqeqqjqj3q7ny3cs8mp3vk5x4zjjwcd30df3slyqm6td5ent60hz9xaea9skncdwma34v4vulvj8rfyhpp0gumfqnfawd6telmuflzw3u9g0wsphrrc24',
                    },
                }),
            )

            await waitFor(() => {
                expect(mockDispatch).toHaveBeenCalledWith({
                    type: 'browser/setInvoiceToPay',
                    payload: {
                        paymentHash: 'hash',
                        amount: 100000,
                        fee: 0,
                        description: 'desc',
                        invoice: '12345',
                    },
                })
            })
        })
    })
})
