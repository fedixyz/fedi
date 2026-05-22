import '@testing-library/jest-dom'
import { act, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import { selectMatrixRoomEvents } from '@fedi/common/redux'
import {
    createIntegrationTestBuilder,
    RemoteBridgeTestContext,
} from '@fedi/common/tests/utils/remote-bridge-setup'
import { MatrixEvent, MatrixRoom } from '@fedi/common/types'
import { isPollEvent } from '@fedi/common/utils/matrix'

import { ChatEvent } from '../../src/components/Chat/ChatEvent'
import { useAppSelector } from '../../src/hooks'
import { renderWithBridge } from '../utils/render'

const PollTimelineEvent: React.FC<{ roomId: MatrixRoom['id'] }> = ({
    roomId,
}) => {
    useObserveMatrixRoom(roomId)

    const pollEvent = useAppSelector(state =>
        selectMatrixRoomEvents(state, roomId).find(isPollEvent),
    )

    if (!pollEvent) return null

    return <ChatEvent event={pollEvent} />
}

async function createPollAndWaitForTimelineEvent({
    answers,
    fedimint,
    question,
    roomId,
    store,
}: {
    answers: string[]
    fedimint: RemoteBridgeTestContext['bridge']['fedimint']
    question: string
    roomId: MatrixRoom['id']
    store: RemoteBridgeTestContext['store']
}): Promise<MatrixEvent<'m.poll'>> {
    await act(async () => {
        await fedimint.matrixStartPoll(roomId, question, answers, false, true)
    })

    return waitFor(() => {
        const pollEvent = selectMatrixRoomEvents(store.getState(), roomId).find(
            (event): event is MatrixEvent<'m.poll'> =>
                isPollEvent(event) &&
                event.content.body === question &&
                !event.localEcho &&
                event.sendState === null &&
                event.id.startsWith('$'),
        )

        expect(pollEvent).toBeDefined()
        return pollEvent as MatrixEvent<'m.poll'>
    })
}

describe('ChatPollEvent integration', () => {
    const builder = createIntegrationTestBuilder(waitFor)
    const context = builder.getContext()

    it('should create, render, self-vote, and show disclosed poll results', async () => {
        await builder.withChatReady()

        const {
            bridge: { fedimint },
            store,
        } = context
        const roomId = await builder.withChatGroupCreated('poll integration')
        const question = 'Where should we meet?'

        renderWithBridge(<PollTimelineEvent roomId={roomId} />, {
            store,
            fedimint,
        })

        const pollEvent = await createPollAndWaitForTimelineEvent({
            answers: ['Lobby', 'Courtyard'],
            fedimint,
            question,
            roomId,
            store,
        })
        const lobbyAnswer = pollEvent.content.answers.find(
            answer => answer.text === 'Lobby',
        )
        const courtyardAnswer = pollEvent.content.answers.find(
            answer => answer.text === 'Courtyard',
        )
        expect(lobbyAnswer).toBeDefined()
        expect(courtyardAnswer).toBeDefined()

        expect(await screen.findByText(question)).toBeInTheDocument()
        expect(
            screen.getByLabelText(`poll-option-${lobbyAnswer?.id}`),
        ).toBeInTheDocument()
        expect(
            screen.getByLabelText(`poll-option-${courtyardAnswer?.id}`),
        ).toBeInTheDocument()

        await act(async () => {
            await fedimint.matrixRespondToPoll(roomId, pollEvent.id, [
                lobbyAnswer?.id as string,
            ])
        })

        await waitFor(() => {
            expect(screen.getByText('100%')).toBeInTheDocument()
            expect(screen.getByText('0%')).toBeInTheDocument()
            expect(
                screen.queryByRole('button', { name: 'Vote' }),
            ).not.toBeInTheDocument()
        })
    }, 120_000)
})
