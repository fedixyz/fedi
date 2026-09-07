import * as Zendesk from 'react-native-zendesk-messaging'

import {
    makeStableBalanceRequestTags,
    zendeskOpenMessagingView,
} from '../../../utils/support'

describe('zendeskOpenMessagingView', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should set the conversation tags before the view opens', async () => {
        const order: string[] = []
        jest.mocked(Zendesk.setConversationTags).mockImplementation(() => {
            order.push('tags')
        })
        jest.mocked(Zendesk.openMessagingView).mockImplementation(async () => {
            order.push('open')
        })

        await zendeskOpenMessagingView({ conversationTags: ['a', 'b'] })

        expect(Zendesk.setConversationTags).toHaveBeenCalledWith(['a', 'b'])
        expect(Zendesk.clearConversationTags).not.toHaveBeenCalled()
        expect(order).toEqual(['tags', 'open'])
    })

    it('should clear stored tags when opened without any', async () => {
        // the sdk keeps tags until cleared, so a tagged request must not
        // leak into the next generic support conversation
        await zendeskOpenMessagingView()

        expect(Zendesk.clearConversationTags).toHaveBeenCalledTimes(1)
        expect(Zendesk.setConversationTags).not.toHaveBeenCalled()
        expect(Zendesk.openMessagingView).toHaveBeenCalledTimes(1)
    })

    it('should report a failure to open instead of throwing', async () => {
        const error = new Error('no view')
        jest.mocked(Zendesk.openMessagingView).mockRejectedValueOnce(error)
        const onError = jest.fn()

        await zendeskOpenMessagingView({ onError })

        expect(onError).toHaveBeenCalledWith(error)
    })
})

describe('makeStableBalanceRequestTags', () => {
    it('should name the request and the wallet service', () => {
        expect(makeStableBalanceRequestTags('abc123')).toEqual([
            'stable-balance-request',
            'wallet-service-abc123',
        ])
    })

    it('should still name the request when the federation is unknown', () => {
        expect(makeStableBalanceRequestTags(null)).toEqual([
            'stable-balance-request',
        ])
    })
})
