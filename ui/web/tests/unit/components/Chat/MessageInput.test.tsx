import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    setMatrixAuth,
    setMatrixRoomMembers,
    setMatrixRoomPowerLevels,
    setupStore,
} from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import {
    ChatType,
    MatrixAuth,
    MatrixPowerLevel,
    MatrixRoom,
    MatrixRoomMember,
} from '@fedi/common/types'

import { MessageInput } from '../../../../src/components/Chat/MessageInput'
import { renderWithProviders } from '../../../utils/render'

jest.mock('../../../../src/hooks/dom')

const ROOM_ID = '!room:example.com'
const NEW_USER_ID = '@new-user:example.com'
const SELF_USER_ID = '@self:example.com'

const onMessageSubmitted = jest.fn()
const onWalletClick = jest.fn()

function makeStore(room?: Partial<MatrixRoom>) {
    const store = setupStore()

    if (room) {
        store.dispatch(
            handleMatrixRoomListStreamUpdates([
                { PushBack: { value: { status: 'ready', id: ROOM_ID } } },
            ]),
        )
        store.dispatch(
            addMatrixRoomInfo({
                ...MOCK_MATRIX_ROOM,
                id: ROOM_ID,
                isPublic: false,
                ...room,
            }),
        )
    }

    return store
}

function makeReadonlyStore() {
    const store = makeStore({
        isDirect: false,
        isPublic: false,
    })

    store.dispatch(
        setMatrixAuth({
            userId: SELF_USER_ID,
        } as MatrixAuth),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: ROOM_ID,
            members: [
                {
                    id: SELF_USER_ID,
                    displayName: 'Self',
                    avatarUrl: undefined,
                    powerLevel: {
                        type: 'int',
                        value: MatrixPowerLevel.Member,
                    },
                    roomId: ROOM_ID,
                    membership: 'join',
                    ignored: false,
                } as MatrixRoomMember,
            ],
        }),
    )
    store.dispatch(
        setMatrixRoomPowerLevels({
            roomId: ROOM_ID,
            powerLevels: {
                events: {
                    'm.room.message': MatrixPowerLevel.Moderator,
                },
            },
        }),
    )

    return store
}

function makePublicGroupStore(powerLevel: MatrixPowerLevel) {
    const store = makeStore({
        isDirect: false,
        isPublic: true,
    })

    store.dispatch(
        setMatrixAuth({
            userId: SELF_USER_ID,
        } as MatrixAuth),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: ROOM_ID,
            members: [
                {
                    id: SELF_USER_ID,
                    displayName: 'Self',
                    avatarUrl: undefined,
                    powerLevel: {
                        type: 'int',
                        value: powerLevel,
                    },
                    roomId: ROOM_ID,
                    membership: 'join',
                    ignored: false,
                } as MatrixRoomMember,
            ],
        }),
    )
    store.dispatch(
        setMatrixRoomPowerLevels({
            roomId: ROOM_ID,
            powerLevels: {
                events_default: MatrixPowerLevel.Member,
            },
        }),
    )

    return store
}

describe('/components/Chat/MessageInput', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should show wallet, plus, and send controls for existing direct chats', () => {
        const store = makeStore({
            isDirect: true,
            directUserId: '@recipient:example.com',
            isPublic: false,
        })

        renderWithProviders(
            <MessageInput
                type={ChatType.direct}
                id={ROOM_ID}
                onWalletClick={onWalletClick}
                onMessageSubmitted={onMessageSubmitted}
            />,
            { store },
        )

        expect(screen.getByRole('textbox')).toBeInTheDocument()
        expect(screen.getByLabelText('wallet-icon')).toBeInTheDocument()
        expect(screen.getByLabelText('plus-icon')).toBeInTheDocument()
        expect(screen.getByLabelText('send-button')).toBeInTheDocument()
    })

    it('should show plus and send controls for existing private group chats', () => {
        const store = makeStore({
            isDirect: false,
            isPublic: false,
        })

        renderWithProviders(
            <MessageInput
                type={ChatType.group}
                id={ROOM_ID}
                onMessageSubmitted={onMessageSubmitted}
            />,
            { store },
        )

        expect(screen.getByRole('textbox')).toBeInTheDocument()
        expect(screen.queryByLabelText('wallet-icon')).not.toBeInTheDocument()
        expect(screen.getByLabelText('plus-icon')).toBeInTheDocument()
        expect(screen.getByLabelText('send-button')).toBeInTheDocument()
    })

    it('should show plus and send controls for public group moderators', () => {
        const store = makePublicGroupStore(MatrixPowerLevel.Moderator)

        renderWithProviders(
            <MessageInput
                type={ChatType.group}
                id={ROOM_ID}
                onMessageSubmitted={onMessageSubmitted}
            />,
            { store },
        )

        expect(screen.getByRole('textbox')).toBeInTheDocument()
        expect(screen.queryByLabelText('wallet-icon')).not.toBeInTheDocument()
        expect(screen.getByLabelText('plus-icon')).toBeInTheDocument()
        expect(screen.getByTestId('file-upload')).toBeInTheDocument()
        expect(screen.getByLabelText('send-button')).toBeInTheDocument()
    })

    it('should hide media controls for public group members', () => {
        const store = makePublicGroupStore(MatrixPowerLevel.Member)

        renderWithProviders(
            <MessageInput
                type={ChatType.group}
                id={ROOM_ID}
                onMessageSubmitted={onMessageSubmitted}
            />,
            { store },
        )

        expect(screen.getByRole('textbox')).toBeInTheDocument()
        expect(screen.queryByLabelText('wallet-icon')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('plus-icon')).not.toBeInTheDocument()
        expect(screen.queryByTestId('file-upload')).not.toBeInTheDocument()
        expect(screen.getByLabelText('send-button')).toBeInTheDocument()
    })

    it('should show only send controls for new direct chats', () => {
        const store = makeStore()

        renderWithProviders(
            <MessageInput
                type={ChatType.direct}
                id={NEW_USER_ID}
                onWalletClick={onWalletClick}
                onMessageSubmitted={onMessageSubmitted}
            />,
            { store },
        )

        expect(screen.getByRole('textbox')).toBeInTheDocument()
        expect(screen.queryByLabelText('wallet-icon')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('plus-icon')).not.toBeInTheDocument()
        expect(screen.queryByTestId('file-upload')).not.toBeInTheDocument()
        expect(screen.getByLabelText('send-button')).toBeInTheDocument()
    })

    it('should hide action controls for read-only chats', () => {
        const store = makeReadonlyStore()

        renderWithProviders(
            <MessageInput
                type={ChatType.group}
                id={ROOM_ID}
                onMessageSubmitted={onMessageSubmitted}
            />,
            { store },
        )

        expect(screen.getByRole('textbox')).toBeDisabled()
        expect(screen.queryByLabelText('wallet-icon')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('plus-icon')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('send-button')).not.toBeInTheDocument()
    })

    it('should not submit an empty message', async () => {
        const store = makeStore({
            isDirect: true,
            directUserId: '@recipient:example.com',
            isPublic: false,
        })

        renderWithProviders(
            <MessageInput
                type={ChatType.direct}
                id={ROOM_ID}
                onMessageSubmitted={onMessageSubmitted}
            />,
            { store },
        )

        await userEvent.click(screen.getByLabelText('send-button'))

        expect(onMessageSubmitted).not.toHaveBeenCalled()
    })

    it('should submit typed messages', async () => {
        const store = makeStore({
            isDirect: true,
            directUserId: '@recipient:example.com',
            isPublic: false,
        })

        renderWithProviders(
            <MessageInput
                type={ChatType.direct}
                id={ROOM_ID}
                onMessageSubmitted={onMessageSubmitted}
            />,
            { store },
        )

        await userEvent.type(screen.getByRole('textbox'), 'test')
        await userEvent.click(screen.getByLabelText('send-button'))

        await waitFor(() => {
            expect(onMessageSubmitted).toHaveBeenCalledWith('test', [], null)
        })
    })

    it('should submit selected files', async () => {
        const store = makeStore({
            isDirect: true,
            directUserId: '@recipient:example.com',
            isPublic: false,
        })
        const file = new File(['test'], 'test.png', { type: 'image/png' })

        renderWithProviders(
            <MessageInput
                type={ChatType.direct}
                id={ROOM_ID}
                onMessageSubmitted={onMessageSubmitted}
            />,
            { store },
        )

        await userEvent.upload(screen.getByTestId('file-upload'), file)
        await userEvent.click(screen.getByLabelText('send-button'))

        await waitFor(() => {
            expect(onMessageSubmitted).toHaveBeenCalledWith('', [file], null)
        })
    })
})
