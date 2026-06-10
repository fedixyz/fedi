import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setupStore } from '@fedi/common/redux'
import { createMockNonPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { MatrixEvent } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'

import { ChatMessageActionsDrawer } from '../../../../src/components/Chat/ChatMessageActionsDrawer'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

const ROOM_ID = '!room:example.com'
const EVENT_ID = '$event:example.com'

const event = createMockNonPaymentEvent({
    id: EVENT_ID as RpcTimelineEventItemId,
    roomId: ROOM_ID,
}) as MatrixEvent
const nonReplyableEvent = {
    ...event,
    content: {
        ...event.content,
        msgtype: 'm.audio',
    },
} as MatrixEvent

describe('/components/Chat/ChatMessageActionsDrawer', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should show web message actions without reactions', () => {
        renderWithProviders(
            <ChatMessageActionsDrawer
                event={event}
                open
                onOpenChange={jest.fn()}
            />,
            { store: setupStore() },
        )

        expect(screen.getByText(i18n.t('words.reply'))).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('feature.chat.pin-message')),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('feature.chat.create-poll')),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('words.react')),
        ).not.toBeInTheDocument()
    })

    it('should activate reply and close the drawer', async () => {
        const onOpenChange = jest.fn()
        const { store } = renderWithProviders(
            <ChatMessageActionsDrawer
                event={event}
                open
                onOpenChange={onOpenChange}
            />,
            { store: setupStore() },
        )

        await userEvent.click(screen.getByText(i18n.t('words.reply')))

        expect(store.getState().matrix.replyingToMessage.event?.id).toBe(
            EVENT_ID,
        )
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('should keep the drawer closeable when there are no available actions', async () => {
        const onOpenChange = jest.fn()
        renderWithProviders(
            <ChatMessageActionsDrawer
                event={nonReplyableEvent}
                open
                onOpenChange={onOpenChange}
            />,
            { store: setupStore() },
        )

        expect(
            screen.getByTestId('message-actions-backdrop'),
        ).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('words.reply')),
        ).not.toBeInTheDocument()

        await userEvent.keyboard('{Escape}')

        expect(onOpenChange).toHaveBeenCalledWith(false)
    })
})
