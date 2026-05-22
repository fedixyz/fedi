import '@testing-library/jest-dom'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    setMatrixAuth,
    setMatrixRoomMembers,
    setMatrixRoomPowerLevels,
    setupStore,
} from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import {
    MatrixAuth,
    MatrixEvent,
    MatrixPowerLevel,
    MatrixRoomMember,
} from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'

import { ChatPollEvent } from '../../../../src/components/Chat/ChatPollEvent'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

const mockToastError = jest.fn()

jest.mock('@fedi/common/hooks/toast', () => ({
    useToast: () => ({
        error: mockToastError,
        show: jest.fn(),
        close: jest.fn(),
    }),
}))

const ROOM_ID = '!poll-room:example.com'
const POLL_ID = '$poll-event'
const SELF_ID = '@self:example.com'
const OTHER_ID = '@other:example.com'

type PollEventOverride = Partial<Omit<MatrixEvent<'m.poll'>, 'content'>> & {
    content?: Partial<MatrixEvent<'m.poll'>['content']>
}

function makePollEvent(
    overrides: PollEventOverride = {},
): MatrixEvent<'m.poll'> {
    const baseEvent: MatrixEvent<'m.poll'> = {
        id: POLL_ID as RpcTimelineEventItemId,
        roomId: ROOM_ID,
        timestamp: Date.now(),
        localEcho: false,
        sender: OTHER_ID,
        sendState: null,
        inReply: null,
        mentions: null,
        content: {
            msgtype: 'm.poll',
            body: 'Where should we meet?',
            kind: 'disclosed',
            maxSelections: 1,
            answers: [
                { id: 'answer-1', text: 'Lobby' },
                { id: 'answer-2', text: 'Courtyard' },
            ],
            votes: {},
            endTime: null,
            hasBeenEdited: false,
        },
    }

    return {
        ...baseEvent,
        ...overrides,
        content: {
            ...baseEvent.content,
            ...overrides.content,
        },
    }
}

function makeStore({
    userId = SELF_ID,
    isReadOnly = false,
}: {
    userId?: string
    isReadOnly?: boolean
} = {}) {
    const store = setupStore()
    const currentUser: MatrixRoomMember = {
        id: userId,
        displayName: 'Current User',
        avatarUrl: undefined,
        powerLevel: { type: 'int', value: MatrixPowerLevel.Member },
        roomId: ROOM_ID,
        membership: 'join',
        ignored: false,
    }

    store.dispatch(
        setMatrixAuth({
            userId,
            deviceId: 'device-1',
        } as MatrixAuth),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: ROOM_ID,
            members: [currentUser],
        }),
    )
    store.dispatch(
        setMatrixRoomPowerLevels({
            roomId: ROOM_ID,
            powerLevels: {
                events: {
                    'm.room.message': isReadOnly
                        ? MatrixPowerLevel.Moderator
                        : MatrixPowerLevel.Member,
                },
            },
        }),
    )

    return store
}

describe('/components/Chat/ChatPollEvent', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('should submit a single selected answer', async () => {
        const fedimint = createMockFedimintBridge({
            matrixRespondToPoll: async () => undefined,
        })

        renderWithProviders(
            <ChatPollEvent event={makePollEvent()} isMe={false} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        await user.click(screen.getByLabelText('poll-option-answer-1'))
        await user.click(screen.getByText(i18n.t('words.vote')))

        await waitFor(() => {
            expect(fedimint.matrixRespondToPoll).toHaveBeenCalledWith(
                ROOM_ID,
                POLL_ID,
                ['answer-1'],
            )
        })
    })

    it('should lock voting after a successful submit while waiting for timeline update', async () => {
        const matrixRespondToPoll = jest.fn(async () => undefined)
        const fedimint = createMockFedimintBridge({
            matrixRespondToPoll,
        })

        renderWithProviders(
            <ChatPollEvent event={makePollEvent()} isMe={false} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        await user.click(screen.getByLabelText('poll-option-answer-1'))
        await user.click(screen.getByText(i18n.t('words.vote')))

        await waitFor(() => {
            expect(matrixRespondToPoll).toHaveBeenCalledTimes(1)
        })
        expect(screen.queryByText(i18n.t('words.vote'))).not.toBeInTheDocument()
        expect(screen.getByLabelText('poll-option-answer-1')).toBeDisabled()
        expect(screen.getByLabelText('poll-option-answer-1')).toHaveAttribute(
            'aria-pressed',
            'true',
        )

        await user.click(screen.getByLabelText('poll-option-answer-2'))

        expect(matrixRespondToPoll).toHaveBeenCalledTimes(1)
    })

    it('should submit multiple selected answers', async () => {
        const fedimint = createMockFedimintBridge({
            matrixRespondToPoll: async () => undefined,
        })
        const event = makePollEvent({
            content: {
                maxSelections: 2,
            },
        })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        await user.click(screen.getByLabelText('poll-option-answer-1'))
        await user.click(screen.getByLabelText('poll-option-answer-2'))
        await user.click(screen.getByText(i18n.t('words.vote')))

        await waitFor(() => {
            expect(fedimint.matrixRespondToPoll).toHaveBeenCalledWith(
                ROOM_ID,
                POLL_ID,
                ['answer-1', 'answer-2'],
            )
        })
    })

    it('should show results for disclosed polls after voting', () => {
        const event = makePollEvent({
            content: {
                votes: {
                    'answer-1': [SELF_ID, '@alice:example.com'],
                    'answer-2': ['@bob:example.com'],
                },
            },
        })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
            },
        )

        expect(screen.getByText('67%')).toBeInTheDocument()
        expect(screen.getByText('33%')).toBeInTheDocument()
        expect(screen.queryByText(i18n.t('words.vote'))).not.toBeInTheDocument()
    })

    it('should not show the end control for non-creators', () => {
        renderWithProviders(
            <ChatPollEvent event={makePollEvent()} isMe={false} />,
            {
                store: makeStore(),
            },
        )

        expect(
            screen.queryByText(i18n.t('words.end').toUpperCase()),
        ).not.toBeInTheDocument()
    })

    it('should show voted status for non-creators after voting', () => {
        const event = makePollEvent({
            content: {
                kind: 'undisclosed',
                votes: {
                    'answer-1': [SELF_ID],
                },
            },
        })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
            },
        )

        expect(screen.getByText(i18n.t('words.voted'))).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('words.end').toUpperCase()),
        ).not.toBeInTheDocument()
    })

    it('should show finished status and hide end control for ended creator polls', () => {
        const event = makePollEvent({
            sender: SELF_ID,
            content: {
                endTime: Date.now() - 1_000,
            },
        })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
            },
        )

        expect(screen.getByText(i18n.t('words.finished'))).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('words.end').toUpperCase()),
        ).not.toBeInTheDocument()
    })

    it('should disable voting in read-only rooms', () => {
        const fedimint = createMockFedimintBridge({
            matrixRespondToPoll: async () => undefined,
        })
        renderWithProviders(
            <ChatPollEvent event={makePollEvent()} isMe={false} />,
            {
                store: makeStore({ isReadOnly: true }),
                fedimint,
            },
        )

        expect(
            screen.getByText(i18n.t('feature.chat.only-admins-can-vote')),
        ).toBeInTheDocument()
        expect(screen.getByLabelText('poll-option-answer-1')).toBeDisabled()
        expect(fedimint.matrixRespondToPoll).not.toHaveBeenCalled()
    })

    it('should end a poll after creator confirmation', async () => {
        const fedimint = createMockFedimintBridge({
            matrixEndPoll: async () => undefined,
        })
        const event = makePollEvent({ sender: SELF_ID })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        await user.click(screen.getByText(i18n.t('words.end').toUpperCase()))
        await user.click(
            screen.getByRole('button', { name: i18n.t('words.confirm') }),
        )

        await waitFor(() => {
            expect(fedimint.matrixEndPoll).toHaveBeenCalledWith(
                ROOM_ID,
                POLL_ID,
            )
        })
    })

    it('should not send duplicate end-poll requests while ending is in flight', async () => {
        let resolveEndPoll: () => void = jest.fn()
        const matrixEndPoll = jest.fn(
            () =>
                new Promise<void>(resolve => {
                    resolveEndPoll = resolve
                }),
        )
        const fedimint = createMockFedimintBridge({
            matrixEndPoll,
        })
        const event = makePollEvent({ sender: SELF_ID })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        const endButton = screen.getByText(i18n.t('words.end').toUpperCase())
        fireEvent.click(endButton)
        const confirmButton = screen.getByRole('button', {
            name: i18n.t('words.confirm'),
        })
        fireEvent.click(confirmButton)
        fireEvent.click(confirmButton)

        expect(matrixEndPoll).toHaveBeenCalledTimes(1)

        await act(async () => {
            resolveEndPoll()
        })
    })

    it('should not end a poll when creator confirmation is cancelled', async () => {
        const fedimint = createMockFedimintBridge({
            matrixEndPoll: async () => undefined,
        })
        const event = makePollEvent({ sender: SELF_ID })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        await user.click(screen.getByText(i18n.t('words.end').toUpperCase()))
        await user.click(
            screen.getByRole('button', { name: i18n.t('words.cancel') }),
        )

        expect(fedimint.matrixEndPoll).not.toHaveBeenCalled()
    })

    it('should show a toast when voting fails', async () => {
        const fedimint = createMockFedimintBridge({
            matrixRespondToPoll: async () => {
                throw new Error('vote failed')
            },
        })

        renderWithProviders(
            <ChatPollEvent event={makePollEvent()} isMe={false} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        await user.click(screen.getByLabelText('poll-option-answer-1'))
        await user.click(screen.getByText(i18n.t('words.vote')))

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith(
                expect.any(Function),
                expect.any(Error),
                'errors.unknown-error',
            )
        })
    })

    it('should show a toast when ending a poll fails', async () => {
        jest.spyOn(window, 'confirm').mockReturnValue(true)
        const fedimint = createMockFedimintBridge({
            matrixEndPoll: async () => {
                throw new Error('end failed')
            },
        })
        const event = makePollEvent({ sender: SELF_ID })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        await user.click(screen.getByText(i18n.t('words.end').toUpperCase()))
        await user.click(
            screen.getByRole('button', { name: i18n.t('words.confirm') }),
        )

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith(
                expect.any(Function),
                expect.any(Error),
                'errors.unknown-error',
            )
        })
    })

    it('should toggle off a selected answer in multi-choice polls', async () => {
        const fedimint = createMockFedimintBridge({
            matrixRespondToPoll: async () => undefined,
        })
        const event = makePollEvent({
            content: {
                maxSelections: 2,
            },
        })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        await user.click(screen.getByLabelText('poll-option-answer-1'))
        await user.click(screen.getByLabelText('poll-option-answer-2'))
        await user.click(screen.getByLabelText('poll-option-answer-1'))
        await user.click(screen.getByText(i18n.t('words.vote')))

        await waitFor(() => {
            expect(fedimint.matrixRespondToPoll).toHaveBeenCalledWith(
                ROOM_ID,
                POLL_ID,
                ['answer-2'],
            )
        })
    })

    it('should replace the selected answer in single-choice polls', async () => {
        const fedimint = createMockFedimintBridge({
            matrixRespondToPoll: async () => undefined,
        })

        renderWithProviders(
            <ChatPollEvent event={makePollEvent()} isMe={false} />,
            {
                store: makeStore(),
                fedimint,
            },
        )

        await user.click(screen.getByLabelText('poll-option-answer-1'))
        await user.click(screen.getByLabelText('poll-option-answer-2'))
        await user.click(screen.getByText(i18n.t('words.vote')))

        await waitFor(() => {
            expect(fedimint.matrixRespondToPoll).toHaveBeenCalledWith(
                ROOM_ID,
                POLL_ID,
                ['answer-2'],
            )
        })
    })

    it('should not select answers in read-only rooms', async () => {
        renderWithProviders(
            <ChatPollEvent event={makePollEvent()} isMe={false} />,
            {
                store: makeStore({ isReadOnly: true }),
            },
        )

        await user.click(screen.getByLabelText('poll-option-answer-1'))

        expect(screen.getByLabelText('poll-option-answer-1')).toHaveAttribute(
            'aria-pressed',
            'false',
        )
    })

    it('should not change selections after voting', async () => {
        const event = makePollEvent({
            content: {
                kind: 'undisclosed',
                votes: {
                    'answer-1': [SELF_ID],
                },
            },
        })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
            },
        )

        await user.click(screen.getByLabelText('poll-option-answer-2'))

        expect(screen.getByLabelText('poll-option-answer-1')).toHaveAttribute(
            'aria-pressed',
            'true',
        )
        expect(screen.getByLabelText('poll-option-answer-2')).toHaveAttribute(
            'aria-pressed',
            'false',
        )
    })

    it('should keep undisclosed voted polls locked instead of showing results', () => {
        const event = makePollEvent({
            content: {
                kind: 'undisclosed',
                votes: {
                    'answer-1': [SELF_ID, '@alice:example.com'],
                    'answer-2': ['@bob:example.com'],
                },
            },
        })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
            },
        )

        expect(screen.getByText(i18n.t('words.voted'))).toBeInTheDocument()
        expect(screen.getByLabelText('poll-option-answer-1')).toBeDisabled()
        expect(screen.queryByText('67%')).not.toBeInTheDocument()
        expect(screen.queryByText('33%')).not.toBeInTheDocument()
        expect(screen.queryByText(i18n.t('words.vote'))).not.toBeInTheDocument()
    })

    it('should show results for ended polls regardless of vote status', () => {
        const event = makePollEvent({
            content: {
                endTime: Date.now() - 1_000,
                kind: 'undisclosed',
                votes: {
                    'answer-1': ['@alice:example.com'],
                    'answer-2': ['@bob:example.com'],
                },
            },
        })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
            },
        )

        expect(screen.getAllByText('50%')).toHaveLength(2)
        expect(screen.queryByText(i18n.t('words.vote'))).not.toBeInTheDocument()
    })

    it('should render zero percent results for ended polls with no votes', () => {
        const event = makePollEvent({
            content: {
                endTime: Date.now() - 1_000,
                votes: {},
            },
        })

        renderWithProviders(
            <ChatPollEvent event={event} isMe={event.sender === SELF_ID} />,
            {
                store: makeStore(),
            },
        )

        expect(screen.getAllByText('0%')).toHaveLength(2)
    })
})
