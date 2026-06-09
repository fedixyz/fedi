import { act, waitFor } from '@testing-library/react'

import { usePendingJoinRequests } from '@fedi/common/hooks/matrix'
import {
    selectToast,
    setMatrixAuth,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import {
    MatrixAuth,
    MatrixPowerLevel,
    MatrixRoomMember,
} from '@fedi/common/types'

import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '../../utils/fedimint'
import { renderHookWithState } from '../../utils/render'
import { createMockT } from '../../utils/setup'

const ROOM = '!room:example.com'
const ME = '@me:example.com'
const ALICE = '@alice:example.com'
const BOB = '@bob:example.com'

const member = (
    id: string,
    membership: MatrixRoomMember['membership'],
    powerLevel = 0,
): MatrixRoomMember => ({
    id,
    roomId: ROOM,
    displayName: id,
    avatarUrl: undefined,
    powerLevel: { type: 'int', value: powerLevel },
    membership,
    ignored: false,
})

const moderator = member(ME, 'join', MatrixPowerLevel.Moderator)
const regular = member(ME, 'join', MatrixPowerLevel.Member)
const knocker = (id: string) => member(id, 'knock')

const renderPending = (
    members: MatrixRoomMember[],
    methods: Partial<Parameters<typeof createMockFedimintBridge>[0]> = {},
) => {
    const refetchRoomMembers = jest.fn().mockResolvedValue(undefined)
    const fedimint = createMockFedimintBridge({
        matrixRoomInviteUserById: () => Promise.resolve(undefined),
        matrixRoomKickUser: () => Promise.resolve(undefined),
        ...methods,
    })
    fedimint.getMatrixClient = jest.fn().mockReturnValue({
        refetchRoomMembers,
    }) as unknown as MockFedimintBridge['getMatrixClient']

    const store = setupStore()
    store.dispatch(setMatrixAuth({ userId: ME } as MatrixAuth))
    store.dispatch(setMatrixRoomMembers({ roomId: ROOM, members }))

    const t = createMockT()
    const rendered = renderHookWithState(
        () => usePendingJoinRequests(ROOM, t),
        store,
        fedimint,
    )

    return { store, fedimint, refetchRoomMembers, ...rendered }
}

const flush = () => act(async () => {})

describe('usePendingJoinRequests', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('permission gating and the indicator', () => {
        it('lets a moderator respond and surfaces unseen requests', async () => {
            const { result } = renderPending([moderator, knocker(ALICE)])

            expect(result.current.canRespond).toBe(true)
            expect(result.current.pendingCount).toBe(1)
            expect(result.current.pendingMembers.map(m => m.id)).toEqual([
                ALICE,
            ])
            expect(result.current.shouldShowIndicator).toBe(true)

            await flush()
        })

        it('denies a non-moderator and hides the indicator despite pending requests', async () => {
            const { result } = renderPending([regular, knocker(ALICE)])

            expect(result.current.canRespond).toBe(false)
            expect(result.current.shouldShowIndicator).toBe(false)
            // the list itself is not gated; the UI gates on canRespond
            expect(result.current.pendingCount).toBe(1)

            await flush()
        })
    })

    describe('markSeen', () => {
        it('acknowledges current requests, persists them, and clears the indicator', async () => {
            const { store, result } = renderPending([moderator, knocker(ALICE)])
            expect(result.current.shouldShowIndicator).toBe(true)

            act(() => {
                result.current.markSeen()
            })

            await waitFor(() =>
                expect(result.current.shouldShowIndicator).toBe(false),
            )
            expect(store.getState().matrix.seenKnockRequests[ROOM]).toEqual([
                ALICE,
            ])
        })

        it('is a no-op when there are no pending requests', async () => {
            const { store, result } = renderPending([moderator])

            act(() => {
                result.current.markSeen()
            })

            expect(
                store.getState().matrix.seenKnockRequests[ROOM],
            ).toBeUndefined()
            await flush()
        })

        it('re-shows the indicator when a new request arrives after others were seen', async () => {
            const { store, result } = renderPending([moderator, knocker(ALICE)])

            act(() => {
                result.current.markSeen()
            })
            await waitFor(() =>
                expect(result.current.shouldShowIndicator).toBe(false),
            )

            act(() => {
                store.dispatch(
                    setMatrixRoomMembers({
                        roomId: ROOM,
                        members: [moderator, knocker(ALICE), knocker(BOB)],
                    }),
                )
            })

            await waitFor(() =>
                expect(result.current.shouldShowIndicator).toBe(true),
            )
            expect(result.current.pendingCount).toBe(2)
        })
    })

    describe('responding to a request', () => {
        it('accepts a request: invites the user, toasts success, clears processing', async () => {
            const { store, fedimint, result } = renderPending([
                moderator,
                knocker(ALICE),
            ])

            await act(async () => {
                await result.current.accept(ALICE)
            })

            expect(fedimint.matrixRoomInviteUserById).toHaveBeenCalledWith({
                roomId: ROOM,
                userId: ALICE,
            })
            expect(fedimint.matrixRoomKickUser).not.toHaveBeenCalled()
            expect(selectToast(store.getState())).toEqual(
                expect.objectContaining({
                    content: 'feature.chat.knock-accepted',
                    status: 'success',
                }),
            )
            expect(result.current.processingUserId).toBeNull()
        })

        it('declines a request: kicks the user with no reason, toasts decline', async () => {
            const { store, fedimint, result } = renderPending([
                moderator,
                knocker(ALICE),
            ])

            await act(async () => {
                await result.current.decline(ALICE)
            })

            expect(fedimint.matrixRoomKickUser).toHaveBeenCalledWith({
                roomId: ROOM,
                userId: ALICE,
                reason: null,
            })
            expect(fedimint.matrixRoomInviteUserById).not.toHaveBeenCalled()
            expect(selectToast(store.getState())).toEqual(
                expect.objectContaining({
                    content: 'feature.chat.knock-declined',
                    status: 'success',
                }),
            )
            expect(result.current.processingUserId).toBeNull()
        })

        it('shows an error toast and clears processing when a response fails', async () => {
            const { store, result } = renderPending(
                [moderator, knocker(ALICE)],
                {
                    matrixRoomInviteUserById: () =>
                        Promise.reject(new Error('nope')),
                },
            )

            await act(async () => {
                await result.current.accept(ALICE)
            })

            expect(selectToast(store.getState())).toEqual(
                expect.objectContaining({
                    content: 'errors.unknown-error',
                    status: 'error',
                }),
            )
            expect(result.current.processingUserId).toBeNull()
        })

        it('marks the user as processing while the response is in flight', async () => {
            let resolveInvite = () => {}
            const invite = new Promise<void>(resolve => {
                resolveInvite = resolve
            })
            const { result } = renderPending([moderator, knocker(ALICE)], {
                matrixRoomInviteUserById: () => invite,
            })

            let pending: Promise<void> = Promise.resolve()
            act(() => {
                pending = result.current.accept(ALICE)
            })
            expect(result.current.processingUserId).toBe(ALICE)

            await act(async () => {
                resolveInvite()
                await pending
            })
            expect(result.current.processingUserId).toBeNull()
        })
    })

    describe('member refetch on mount', () => {
        it('refetches members when the viewer can respond', async () => {
            const { refetchRoomMembers } = renderPending([
                moderator,
                knocker(ALICE),
            ])

            await waitFor(() =>
                expect(refetchRoomMembers).toHaveBeenCalledWith(ROOM),
            )
        })

        it('does not refetch members when the viewer cannot respond', async () => {
            const { refetchRoomMembers } = renderPending([
                regular,
                knocker(ALICE),
            ])

            await flush()
            expect(refetchRoomMembers).not.toHaveBeenCalled()
        })
    })
})
