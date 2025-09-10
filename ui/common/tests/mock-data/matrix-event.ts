import {
    MatrixEvent,
    MatrixEventStatus,
    MatrixFormEvent,
    MatrixPaymentEvent,
    MatrixPaymentStatus,
} from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'

// Simple function to create event with overrides, properly merging nested content
function makeEventWithOverrides<T extends { content: any }>(
    baseEvent: T,
    overrides: any = {},
): T {
    return {
        ...baseEvent,
        ...overrides,
        content: {
            ...baseEvent.content,
            ...overrides.content,
        },
    }
}

// Base mock event with common fields
const MOCK_EVENT = {
    id: '14',
    eventId: '$lZ5PilJSxLL_OBo0_bZuva7Z-Wnw-tMN9Um1DBpw0Yk',
    roomId: '!tErPyFRkaElRGYRAyQ:m1.8fa.in',
    senderId:
        '@npub1rvlu99xmn62wn5neseg3dayjp857tzu6yeefnwr4ctrqkn5h08wqttl4ja:m1.8fa.in',
    timestamp: 1750083034389,
    status: MatrixEventStatus.sent,
    error: null,
    txnId: undefined,
}

// Mock event factories
const MOCK_PAYMENT_EVENT = {
    ...MOCK_EVENT,
    content: {
        msgtype: 'xyz.fedi.payment' as const,
        body: 'Payment of 1000 sats',
        paymentId: 'payment123',
        status: MatrixPaymentStatus.pushed,
        amount: 1000,
        senderId: 'npub1user123',
        recipientId: 'npub1user456',
        federationId: 'fed123',
        senderOperationId: 'sender-op-123',
        receiverOperationId: undefined,
    },
}

const MOCK_NON_PAYMENT_EVENT = {
    ...MOCK_EVENT,
    content: {
        msgtype: 'm.text' as const,
        body: 'Hello world',
        originalContent: {
            msgtype: 'm.text' as const,
            body: 'Hello world',
        },
    },
}

export const MOCK_FORM_EVENT: MatrixEvent<
    MatrixEventContentType<'xyz.fedi.form'>
> = {
    ...MOCK_EVENT,
    content: {
        msgtype: 'xyz.fedi.form',
        body: 'Accept Terms',
        i18nKeyLabel: 'phrases.accept-terms',
        type: 'button',
        value: 'yes',
    },
}

export const createMockPaymentEvent = (
    overrides: any = {},
): MatrixPaymentEvent => {
    return makeEventWithOverrides(MOCK_PAYMENT_EVENT, overrides)
}

export const createMockNonPaymentEvent = (overrides: any = {}) => {
    return makeEventWithOverrides(MOCK_NON_PAYMENT_EVENT, overrides)
}

export const createMockFormEvent = (overrides: any = {}): MatrixFormEvent => {
    return makeEventWithOverrides(MOCK_FORM_EVENT, overrides)
}

export const mockMatrixEventImage: MatrixEvent<
    MatrixEventContentType<'m.image'>
> = {
    content: {
        body: 'B27534A5-B070-480F-9093-3A2EFA8BF3F4.png',
        msgtype: 'm.image',
        info: {
            mimetype: 'image/png',
            size: 10000,
            w: 100,
            h: 100,
        },
        file: {
            hashes: {
                sha256: 'test',
            },
            url: 'mxc://m1.8fa.in/HIIFNqoGfANjvFOEDULIPoKy',
            v: 'v2',
        },
    },
    error: null,
    eventId: '$lZ5PilJSxLL_OBo0_bZuva7Z-Wnw-tMN9Um1DBpw0Yk',
    id: '14',
    roomId: '!tErPyFRkaElRGYRAyQ:m1.8fa.in',
    senderId:
        '@npub1rvlu99xmn62wn5neseg3dayjp857tzu6yeefnwr4ctrqkn5h08wqttl4ja:m1.8fa.in',
    status: MatrixEventStatus.sent,
    timestamp: 1750083034389,
    txnId: undefined,
}

export const mockMatrixEventVideo: MatrixEvent<
    MatrixEventContentType<'m.video'>
> = {
    content: {
        body: 'B27534A5-B070-480F-9093-3A2EFA8BF3F4.mp4',
        msgtype: 'm.video',
        info: {
            mimetype: 'video/mp4',
            size: 10000,
            w: 100,
            h: 100,
        },
        file: {
            hashes: {
                sha256: 'test',
            },
            url: 'mxc://m1.8fa.in/HIIFNqoGfANjvFOEDULIPoKy',
            v: 'v2',
        },
    },
    error: null,
    eventId: '$lZ5PilJSxLL_OBo0_bZuva7Z-Wnw-tMN9Um1DBpw0Yk',
    id: '14',
    roomId: '!tErPyFRkaElRGYRAyQ:m1.8fa.in',
    senderId:
        '@npub1rvlu99xmn62wn5neseg3dayjp857tzu6yeefnwr4ctrqkn5h08wqttl4ja:m1.8fa.in',
    status: MatrixEventStatus.sent,
    timestamp: 1750083034389,
    txnId: undefined,
}

export const mockMatrixEventFile: MatrixEvent<
    MatrixEventContentType<'m.file'>
> = {
    content: {
        body: 'test-file.pdf',
        msgtype: 'm.file',
        info: {
            mimetype: 'application/pdf',
            size: 10000,
        },
        file: {
            hashes: {
                sha256: 'test',
            },
            url: 'mxc://m1.8fa.in/HIIFNqoGfANjvFOEDULIPoKy',
            v: 'v2',
        },
    },
    error: null,
    eventId: '$lZ5PilJSxLL_OBo0_bZuva7Z-Wnw-tMN9Um1DBpw0Yk',
    id: '14',
    roomId: '!tErPyFRkaElRGYRAyQ:m1.8fa.in',
    senderId:
        '@npub1rvlu99xmn62wn5neseg3dayjp857tzu6yeefnwr4ctrqkn5h08wqttl4ja:m1.8fa.in',
    status: MatrixEventStatus.sent,
    timestamp: 1750083034389,
    txnId: undefined,
}
