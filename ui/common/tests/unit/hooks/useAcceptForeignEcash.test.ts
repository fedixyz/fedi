import { act, waitFor } from '@testing-library/react'
import { t } from 'i18next'

import { useAcceptForeignEcash } from '../../../hooks/chat'
import { setupStore } from '../../../redux'
import { RpcEcashInfo, RpcFederationPreview } from '../../../types/bindings'
import { BridgeError } from '../../../utils/errors'
import { createMockPaymentEvent } from '../../mock-data/matrix-event'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithState } from '../../utils/render'

const INVITE = 'fed1foreigninvite'

const preview: RpcFederationPreview = {
    id: 'foreign-federation',
    name: 'Foreign Federation',
    inviteCode: INVITE,
    meta: {},
    returningMemberStatus: { type: 'newMember' },
}

const paymentEvent = createMockPaymentEvent({
    content: { ecash: 'foreign-ecash' },
})

const notJoined = (invite: string | null): RpcEcashInfo => ({
    federation_type: 'notJoined',
    federation_invite: invite,
    amount: 1000 as RpcEcashInfo['amount'],
})

const bridgeError = (error: string) =>
    new BridgeError({ error, errorCode: null, detail: '' })

const connectionError = bridgeError(
    'Federation rpc error { method => recover, 0 => Connection failed: Failed to connect to peer }',
)

describe('common/hooks/chat', () => {
    describe('useAcceptForeignEcash', () => {
        let store: ReturnType<typeof setupStore>

        beforeEach(() => {
            store = setupStore()
        })

        const render = (
            methods: Parameters<typeof createMockFedimintBridge>[0],
        ) => {
            const fedimint = createMockFedimintBridge(methods)
            const hook = renderHookWithState(
                () => useAcceptForeignEcash(t, paymentEvent),
                store,
                fedimint,
            )
            return { ...hook, fedimint }
        }

        it('loads the join preview when the payment carries a reachable invite', async () => {
            const { result } = render({
                parseEcash: () => Promise.resolve(notJoined(INVITE)),
                federationPreview: () => Promise.resolve(preview),
            })

            expect(result.current.isLoading).toBe(true)
            await waitFor(() => {
                expect(result.current.federationPreview).toEqual(preview)
            })
            expect(result.current.isLoading).toBe(false)
            expect(result.current.issue).toBeNull()
            expect(result.current.issueMessage).toBeNull()
        })

        it('asks for an invite when the payment carries none', async () => {
            const { result, fedimint } = render({
                parseEcash: () => Promise.resolve(notJoined(null)),
                federationPreview: () => Promise.resolve(preview),
            })

            await waitFor(() => {
                expect(result.current.issue).toBe('no-invite')
            })
            expect(result.current.issueMessage).toBe(
                t('feature.receive.foreign-ecash-no-invite'),
            )
            expect(result.current.canRetry).toBe(false)
            expect(result.current.isLoading).toBe(false)
            expect(fedimint.federationPreview).not.toHaveBeenCalled()
        })

        it('reports ecash that cannot be parsed', async () => {
            const { result } = render({
                parseEcash: () => Promise.reject(bridgeError('invalid ecash')),
            })

            await waitFor(() => {
                expect(result.current.issue).toBe('unreadable')
            })
            expect(result.current.issueMessage).toBe(
                t('feature.receive.foreign-ecash-unreadable'),
            )
            expect(result.current.canRetry).toBe(false)
            expect(result.current.isLoading).toBe(false)
        })

        it('offers a retry when the federation is unreachable, and the retry loads the preview', async () => {
            const federationPreview = jest
                .fn()
                .mockRejectedValueOnce(connectionError)
                .mockResolvedValueOnce(preview)
            const { result } = render({
                parseEcash: () => Promise.resolve(notJoined(INVITE)),
                federationPreview,
            })

            await waitFor(() => {
                expect(result.current.issue).toBe('unreachable')
            })
            expect(result.current.issueMessage).toBe(
                t('feature.receive.foreign-ecash-unreachable'),
            )
            expect(result.current.canRetry).toBe(true)
            expect(store.getState().toast.toast).toBeNull()

            await act(async () => {
                result.current.retry()
            })

            await waitFor(() => {
                expect(result.current.federationPreview).toEqual(preview)
            })
            expect(result.current.issue).toBeNull()
            expect(result.current.canRetry).toBe(false)
            expect(federationPreview).toHaveBeenCalledTimes(2)
        })

        it('reports an invite that fails for any other reason', async () => {
            const { result } = render({
                parseEcash: () => Promise.resolve(notJoined(INVITE)),
                federationPreview: () =>
                    Promise.reject(bridgeError('invalid invite code')),
            })

            await waitFor(() => {
                expect(result.current.issue).toBe('invalid-invite')
            })
            expect(result.current.issueMessage).toBe(
                t('feature.receive.foreign-ecash-invalid-invite'),
            )
            expect(result.current.canRetry).toBe(false)
            expect(store.getState().toast.toast).toBeNull()
        })
    })
})
