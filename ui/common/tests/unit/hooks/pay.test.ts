import { act, waitFor } from '@testing-library/react'

import { useParseEcash, useSendEcash } from '../../../hooks/pay'
import {
    refreshGuardianStatuses,
    setFederations,
    setIsInternetUnreachable,
    setupStore,
} from '../../../redux'
import { LoadedFederation, MSats, Sats } from '../../../types'
import {
    GuardianStatus,
    RpcEcashInfo,
    RpcFederationPreview,
} from '../../../types/bindings'
import * as FederationUtils from '../../../utils/FederationUtils'
import { BridgeError } from '../../../utils/errors'
import {
    createMockFederationPreview,
    mockFederation1,
} from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithBridge, renderHookWithState } from '../../utils/render'

const NOT_JOINED_TOKEN = 'token-not-joined'
const JOINED_TOKEN = 'token-joined'

const buildNotJoinedEcash = (): RpcEcashInfo => ({
    federation_type: 'notJoined',
    federation_invite: 'invite-code',
    amount: 10000 as MSats,
})

const buildJoinedEcash = (): RpcEcashInfo => ({
    federation_type: 'joined',
    federation_id: mockFederation1.id,
    amount: 10000 as MSats,
})

describe('ecash generation during connection trouble', () => {
    it.each([false, true])(
        'can send with internet unreachable=%s while a health check is pending',
        async internetUnreachable => {
            const store = setupStore()
            store.dispatch(
                setFederations([
                    { ...mockFederation1, status: 'offline' as const },
                ]),
            )
            let complete!: (guardians: GuardianStatus[]) => void
            const generated = {
                ecash: 'test-ecash',
                operationId: 'test-operation',
            }
            const fedimint = createMockFedimintBridge({
                getGuardianStatus: () =>
                    new Promise<GuardianStatus[]>(resolve => {
                        complete = resolve
                    }),
                generateEcash: async () => generated,
            })
            const pending = store.dispatch(
                refreshGuardianStatuses({
                    fedimint,
                    federation: mockFederation1,
                }),
            )
            if (internetUnreachable)
                store.dispatch(setIsInternetUnreachable(true))
            const { result, unmount } = renderHookWithBridge(
                () => useSendEcash(mockFederation1.id),
                store,
                fedimint,
            )
            await act(async () => {
                expect(await result.current.generateEcash(5 as Sats)).toEqual(
                    generated,
                )
            })
            expect(fedimint.generateEcash).toHaveBeenCalledWith(
                5000,
                mockFederation1.id,
                true,
                expect.anything(),
            )
            expect(result.current.notes).toBe(generated.ecash)
            expect(result.current.isGeneratingEcash).toBe(false)
            await act(async () => {
                complete([])
                await pending
            })
            unmount()
        },
    )

    it('clears the busy state and returns an offline send failure to the screen', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setIsInternetUnreachable(true))
        const error = new BridgeError({
            error: 'offline send failed',
            detail: 'exact denominations unavailable',
            errorCode: 'offlineExactEcashFailed',
        })
        const fedimint = createMockFedimintBridge({
            generateEcash: async () => {
                throw error
            },
        })
        const { result } = renderHookWithBridge(
            () => useSendEcash(mockFederation1.id),
            store,
            fedimint,
        )
        await act(async () => {
            await expect(result.current.generateEcash(5 as Sats)).rejects.toBe(
                error,
            )
        })
        expect(result.current.isGeneratingEcash).toBe(false)
        expect(result.current.notes).toBeNull()
    })
})

describe('common/hooks/pay', () => {
    describe('useParseEcash › newMembersDisabled', () => {
        let store: ReturnType<typeof setupStore>
        let getPreviewSpy: jest.SpyInstance

        beforeEach(() => {
            store = setupStore()
            jest.clearAllMocks()
            getPreviewSpy = jest.spyOn(FederationUtils, 'getFederationPreview')
        })

        afterEach(() => {
            getPreviewSpy.mockRestore()
        })

        const renderWithPreview = (
            ecash: RpcEcashInfo,
            preview: RpcFederationPreview | null,
        ) => {
            const fedimint = createMockFedimintBridge({
                parseEcash: Promise.resolve(ecash),
            })
            if (preview) {
                getPreviewSpy.mockResolvedValue(preview)
            }
            return renderHookWithState(() => useParseEcash(), store, fedimint)
        }

        it('should flag new members as disabled when preview meta opts out of joining', async () => {
            const { result } = renderWithPreview(
                buildNotJoinedEcash(),
                createMockFederationPreview({
                    meta: { new_members_disabled: 'true' },
                    returningMemberStatus: { type: 'newMember' },
                }),
            )

            await act(() => result.current.parseEcash(NOT_JOINED_TOKEN))

            await waitFor(() => {
                expect(result.current.loading).toBe(false)
                expect(result.current.newMembersDisabled).toBe(true)
            })
        })

        it('should let a returning member claim when new members are disabled', async () => {
            const { result } = renderWithPreview(
                buildNotJoinedEcash(),
                createMockFederationPreview({
                    meta: { new_members_disabled: 'true' },
                    returningMemberStatus: { type: 'returningMember' },
                }),
            )

            await act(() => result.current.parseEcash(NOT_JOINED_TOKEN))

            await waitFor(() => {
                expect(result.current.loading).toBe(false)
                expect(result.current.newMembersDisabled).toBe(false)
            })
        })

        it('should treat preview without new_members_disabled meta as joinable', async () => {
            const { result } = renderWithPreview(
                buildNotJoinedEcash(),
                createMockFederationPreview({ meta: {} }),
            )

            await act(() => result.current.parseEcash(NOT_JOINED_TOKEN))

            await waitFor(() => {
                expect(result.current.loading).toBe(false)
                expect(result.current.newMembersDisabled).toBe(false)
            })
        })

        it('should not flag joined federations regardless of meta', async () => {
            store.dispatch(
                setFederations([
                    {
                        ...mockFederation1,
                        meta: { new_members_disabled: 'true' },
                    } as LoadedFederation,
                ]),
            )
            const { result } = renderWithPreview(buildJoinedEcash(), null)

            await act(() => result.current.parseEcash(JOINED_TOKEN))

            await waitFor(() => {
                expect(result.current.loading).toBe(false)
                expect(result.current.newMembersDisabled).toBe(false)
            })
        })

        it('should default to false before any token is parsed', () => {
            const fedimint = createMockFedimintBridge()
            const { result } = renderHookWithState(
                () => useParseEcash(),
                store,
                fedimint,
            )

            expect(result.current.newMembersDisabled).toBe(false)
        })
    })
})
