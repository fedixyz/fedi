import { selectMatrixRoomKnockingMembers, setupStore } from '@fedi/common/redux'
import { MatrixRoomMember } from '@fedi/common/types'

const member = (
    id: string,
    membership: MatrixRoomMember['membership'],
): MatrixRoomMember => ({
    id,
    roomId: 'room-1',
    displayName: id,
    avatarUrl: undefined,
    powerLevel: { type: 'int', value: 0 },
    membership,
    ignored: false,
})

describe('selectMatrixRoomKnockingMembers', () => {
    it('filters to members with knock membership', () => {
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {},
                roomMembers: {
                    'room-1': [
                        member('@alice:example.com', 'join'),
                        member('@bob:example.com', 'knock'),
                        member('@carol:example.com', 'knock'),
                        member('@dave:example.com', 'invite'),
                    ],
                },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)

        expect(
            selectMatrixRoomKnockingMembers(store.getState(), 'room-1').map(
                m => m.id,
            ),
        ).toEqual(['@bob:example.com', '@carol:example.com'])
    })
})
