import { MatrixEventContentType } from '../../utils/matrix'

// Create test Matrix reply event (v1.13 compliant)
export function createTestMatrixReply(
    originalEventId: string,
    originalSenderId: string,
    originalBody: string,
    replyBody: string,
    senderDisplayName?: string,
): MatrixEventContentType<'m.text'> {
    return {
        msgtype: 'm.text',
        // plain text format: "> <sender> original message" followed by reply
        body: `> <${originalSenderId}> ${originalBody}\n\n${replyBody}`,
        format: 'org.matrix.custom.html',
        formatted_body: senderDisplayName
            ? `<p>Replying to ${senderDisplayName}:</p>${replyBody}`
            : replyBody,
        'm.relates_to': {
            'm.in_reply_to': {
                event_id: originalEventId,
            },
        },
    }
}
