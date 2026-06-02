import {
    addMatrixRoomMember,
    markKnockRequestsSeen,
    selectCanRespondToKnockRequests,
    selectShouldShowPendingJoinsIndicator,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'

const ROOM = 'room-1'

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

const makeStore = (
    members: MatrixRoomMember[],
    seenKnockRequests: Record<string, string[]> = {},
) =>
    setupStore({
        matrix: {
            auth: { userId: '@me', displayName: 'me' },
            roomMembers: { [ROOM]: members },
            seenKnockRequests,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

const moderator = member('@me', 'join', MatrixPowerLevel.Moderator)
const knocker = (id: string) => member(id, 'knock')

describe('selectCanRespondToKnockRequests', () => {
    it('is true for a moderator', () => {
        const store = makeStore([moderator])
        expect(selectCanRespondToKnockRequests(store.getState(), ROOM)).toBe(
            true,
        )
    })

    it('is false for a regular member', () => {
        const store = makeStore([
            member('@me', 'join', MatrixPowerLevel.Member),
        ])
        expect(selectCanRespondToKnockRequests(store.getState(), ROOM)).toBe(
            false,
        )
    })
})

describe('selectShouldShowPendingJoinsIndicator', () => {
    it('is false without permission even when requests are pending', () => {
        const store = makeStore([
            member('@me', 'join', MatrixPowerLevel.Member),
            knocker('@alice'),
        ])
        expect(
            selectShouldShowPendingJoinsIndicator(store.getState(), ROOM),
        ).toBe(false)
    })

    it('is true when a moderator has unseen requests', () => {
        const store = makeStore([moderator, knocker('@alice')])
        expect(
            selectShouldShowPendingJoinsIndicator(store.getState(), ROOM),
        ).toBe(true)
    })

    it('is false once every pending request has been seen', () => {
        const store = makeStore([moderator, knocker('@alice')], {
            [ROOM]: ['@alice'],
        })
        expect(
            selectShouldShowPendingJoinsIndicator(store.getState(), ROOM),
        ).toBe(false)
    })

    it('is true again when a new request arrives after others were seen', () => {
        const store = makeStore(
            [moderator, knocker('@alice'), knocker('@bob')],
            { [ROOM]: ['@alice'] },
        )
        expect(
            selectShouldShowPendingJoinsIndicator(store.getState(), ROOM),
        ).toBe(true)
    })
})

describe('markKnockRequestsSeen', () => {
    it('records acknowledged ids, dedupes, and clears the indicator', () => {
        const store = makeStore([moderator, knocker('@alice')])
        store.dispatch(
            markKnockRequestsSeen({ roomId: ROOM, userIds: ['@alice'] }),
        )
        store.dispatch(
            markKnockRequestsSeen({ roomId: ROOM, userIds: ['@alice'] }),
        )
        expect(store.getState().matrix.seenKnockRequests[ROOM]).toEqual([
            '@alice',
        ])
        expect(
            selectShouldShowPendingJoinsIndicator(store.getState(), ROOM),
        ).toBe(false)
    })
})

describe('setMatrixRoomMembers prunes seen knock requests', () => {
    it('drops seen ids no longer knocking and removes empty rooms', () => {
        const store = makeStore([moderator, knocker('@alice')], {
            [ROOM]: ['@alice', '@stale'],
        })

        // @stale resolved (accepted/declined), @alice still knocking
        store.dispatch(
            setMatrixRoomMembers({
                roomId: ROOM,
                members: [moderator, knocker('@alice')],
            }),
        )
        expect(store.getState().matrix.seenKnockRequests[ROOM]).toEqual([
            '@alice',
        ])

        // @alice resolved too -> the room entry is dropped entirely
        store.dispatch(
            setMatrixRoomMembers({ roomId: ROOM, members: [moderator] }),
        )
        expect(store.getState().matrix.seenKnockRequests[ROOM]).toBeUndefined()
    })
})

describe('addMatrixRoomMember prunes seen knock requests', () => {
    it('re-shows the indicator when a seen user leaves and knocks again', () => {
        const store = makeStore([moderator, knocker('@alice')])
        store.dispatch(
            markKnockRequestsSeen({ roomId: ROOM, userIds: ['@alice'] }),
        )
        expect(
            selectShouldShowPendingJoinsIndicator(store.getState(), ROOM),
        ).toBe(false)

        // @alice leaves via a single-member update, then knocks again
        store.dispatch(addMatrixRoomMember(member('@alice', 'leave')))
        store.dispatch(addMatrixRoomMember(member('@alice', 'knock')))

        expect(
            selectShouldShowPendingJoinsIndicator(store.getState(), ROOM),
        ).toBe(true)
    })
})
