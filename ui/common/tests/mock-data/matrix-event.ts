import {
    MatrixEvent,
    MatrixEventKind,
    MatrixFormEvent,
    MatrixPaymentEvent,
} from '@fedi/common/types'

import { RpcMediaSource, RpcTimelineEventItemId } from '../../types/bindings'

// Simple function to create event with overrides, properly merging nested content
function makeEventWithOverrides<T extends MatrixEventKind>(
    baseEvent: MatrixEvent<T>,
    overrides: MockOverride<T> = {},
): MatrixEvent<T> {
    return {
        ...baseEvent,
        ...overrides,
        content: {
            ...baseEvent.content,
            ...overrides.content,
        },
    } satisfies MatrixEvent<T>
}

// Base mock event with common fields
const MOCK_EVENT = {
    id: '$lZ5PilJSxLL_OBo0_bZuva7Z-Wnw-tMN9Um1DBpw0Yk' as RpcTimelineEventItemId,
    roomId: '!tErPyFRkaElRGYRAyQ:m1.8fa.in',
    timestamp: 1750083034389,
    localEcho: false,
    sender: '@npub1rvlu99xmn62wn5neseg3dayjp857tzu6yeefnwr4ctrqkn5h08wqttl4ja:m1.8fa.in',
    sendState: { kind: 'sent', event_id: 'event123' },
    inReply: null,
} satisfies Omit<MatrixEvent<'m.text'>, 'content'>

// Mock event factories
const MOCK_PAYMENT_EVENT = {
    ...MOCK_EVENT,
    content: {
        msgtype: 'xyz.fedi.payment' as const,
        body: 'Payment of 1000 sats',
        paymentId: 'payment123',
        status: 'pushed',
        amount: 1000,
        senderId: 'npub1user123',
        recipientId: 'npub1user456',
        federationId: 'fed123',
        senderOperationId: 'sender-op-123',
    },
} satisfies MatrixEvent<'xyz.fedi.payment'>

const MOCK_NON_PAYMENT_EVENT = {
    ...MOCK_EVENT,
    content: {
        msgtype: 'm.text' as const,
        body: 'Hello world',
        formatted: null,
    },
} satisfies MatrixEvent<'m.text'>

export const MOCK_FORM_EVENT = {
    ...MOCK_EVENT,
    content: {
        msgtype: 'xyz.fedi.form',
        body: 'Accept Terms',
        i18nKeyLabel: 'phrases.accept-terms',
        type: 'button',
        value: 'yes',
        options: null,
        formResponse: null,
    },
} satisfies MatrixEvent<'xyz.fedi.form'>

// Helper type for overriding matrix event content
type MockOverride<T extends MatrixEventKind> = Partial<
    Omit<MatrixEvent<T>, 'content'> & {
        content: Partial<MatrixEvent<T>['content']>
    }
>

export const createMockPaymentEvent = (
    overrides: MockOverride<'xyz.fedi.payment'> = {},
): MatrixPaymentEvent => {
    return makeEventWithOverrides<'xyz.fedi.payment'>(
        MOCK_PAYMENT_EVENT,
        overrides,
    )
}

export const createMockNonPaymentEvent = (
    overrides: MockOverride<'m.text'> = {},
) => {
    return makeEventWithOverrides<'m.text'>(MOCK_NON_PAYMENT_EVENT, overrides)
}

export const createMockFormEvent = (
    overrides: MockOverride<'xyz.fedi.form'> = {},
): MatrixFormEvent => {
    return makeEventWithOverrides<'xyz.fedi.form'>(MOCK_FORM_EVENT, overrides)
}

export const mockMatrixEventImage: MatrixEvent<'m.image'> = {
    ...MOCK_EVENT,
    content: {
        body: 'B27534A5-B070-480F-9093-3A2EFA8BF3F4.png',
        msgtype: 'm.image',
        info: {
            mimetype: 'image/png',
            size: 10000,
            width: 100,
            height: 100,
            thumbnailSource: null,
            thumbnailInfo: null,
        },
        formatted: null,
        filename: 'test-file.pdf',
        source: 'mxc://m1.8fa.in/HIIFNqoGfANjvFOEDULIPoKy' as unknown as RpcMediaSource,
    },
} satisfies MatrixEvent<'m.image'>

export const mockMatrixEventVideo: MatrixEvent<'m.video'> = {
    ...MOCK_EVENT,
    content: {
        body: 'B27534A5-B070-480F-9093-3A2EFA8BF3F4.mp4',
        msgtype: 'm.video',
        info: {
            mimetype: 'video/mp4',
            size: 10000,
            width: 100,
            height: 100,
            thumbnailSource: null,
            thumbnailInfo: null,
            duration: 1000,
        },
        formatted: null,
        filename: 'B27534A5-B070-480F-9093-3A2EFA8BF3F4.mp4',
        source: 'mxc://m1.8fa.in/HIIFNqoGfANjvFOEDULIPoKy' as unknown as RpcMediaSource,
    },
} satisfies MatrixEvent<'m.video'>

export const mockMatrixEventFile: MatrixEvent<'m.file'> = {
    ...MOCK_EVENT,
    content: {
        body: 'test-file.pdf',
        msgtype: 'm.file',
        info: {
            mimetype: 'application/pdf',
            size: 10000,
            thumbnailSource: null,
            thumbnailInfo: null,
        },
        formatted: null,
        filename: 'test-file.pdf',
        source: 'mxc://m1.8fa.in/HIIFNqoGfANjvFOEDULIPoKy' as unknown as RpcMediaSource,
    },
} satisfies MatrixEvent<'m.file'>
