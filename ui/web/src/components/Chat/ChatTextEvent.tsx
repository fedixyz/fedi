import React from 'react'

import { ROOM_MENTION } from '@fedi/common/constants/matrix'
import { selectMatrixAuth, selectMatrixRoomMembers } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { parseMessageText } from '@fedi/common/utils/chat'
import { makeLog } from '@fedi/common/utils/log'
import {
    isHtmlFormattedContent,
    stripReplyFromFormattedBody,
    splitHtmlRuns,
    splitEveryoneRuns,
    parseMentionsFromText,
} from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../hooks'
import { styled } from '../../styles'

const log = makeLog('ChatTextEvent')

interface Props {
    event: MatrixEvent<'m.text'>
}

const renderTextWithBreaks = (text: string) =>
    text.split(/\r?\n/).map((part, index, array) => (
        <React.Fragment key={index}>
            {part}
            {index !== array.length - 1 && <br />}
        </React.Fragment>
    ))

// underline @room tokens inside text
const renderTextWithRoomUnderline = (text: string) => {
    const runs = splitEveryoneRuns(text)
    return runs.map((r, i) =>
        r.type === 'everyone' && r.text.toLowerCase() === `@${ROOM_MENTION}` ? (
            <Underline key={`ev-${i}`}>{r.text}</Underline>
        ) : (
            <React.Fragment key={`tx-${i}`}>
                {renderTextWithBreaks(r.text)}
            </React.Fragment>
        ),
    )
}

export const ChatTextEvent: React.FC<Props> = ({ event }) => {
    const content = event.content
    const selfUserId = useAppSelector(s => selectMatrixAuth(s)?.userId) || null
    const roomMembers =
        useAppSelector(s => selectMatrixRoomMembers(s, event.roomId)) || []

    // If we have formatted HTML, strip reply and render runs
    if (isHtmlFormattedContent(content)) {
        const html = stripReplyFromFormattedBody(content.formatted_body) ?? ''
        if (html.trim()) {
            const runs = splitHtmlRuns(html)
            return (
                <Formatted>
                    {runs.map((r, i) =>
                        r.type === 'link' ? (
                            <A
                                key={`lnk-${i}`}
                                href={r.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={
                                    selfUserId &&
                                    (r.href.includes(
                                        encodeURIComponent(selfUserId),
                                    ) ||
                                        r.href.includes(selfUserId))
                                        ? 'self-mention'
                                        : undefined
                                }>
                                {r.text}
                            </A>
                        ) : (
                            <React.Fragment key={`txt-${i}`}>
                                {parseMessageText(r.text).map((seg, j) =>
                                    seg.type === 'text' ? (
                                        <React.Fragment key={`t-${i}-${j}`}>
                                            {renderTextWithRoomUnderline(
                                                seg.content,
                                            )}
                                        </React.Fragment>
                                    ) : (
                                        <ExternalLink
                                            key={`a-${i}-${j}`}
                                            href={seg.content}
                                            target="_blank"
                                            rel="noopener noreferrer">
                                            {seg.content}
                                        </ExternalLink>
                                    ),
                                )}
                            </React.Fragment>
                        ),
                    )}
                </Formatted>
            )
        }
    }

    // Plain text: upgrade mentions to HTML, then render runs
    if (content.body?.trim()) {
        try {
            const { formattedBody } = parseMentionsFromText(
                content.body,
                roomMembers,
            )
            if (formattedBody?.trim() && /<a\s/i.test(formattedBody)) {
                const runs = splitHtmlRuns(formattedBody)
                return (
                    <Formatted>
                        {runs.map((r, i) =>
                            r.type === 'link' ? (
                                <A
                                    key={`lnk-${i}`}
                                    href={r.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={
                                        selfUserId &&
                                        (r.href.includes(
                                            encodeURIComponent(selfUserId),
                                        ) ||
                                            r.href.includes(selfUserId))
                                            ? 'self-mention'
                                            : undefined
                                    }>
                                    {r.text}
                                </A>
                            ) : (
                                <React.Fragment key={`txt-${i}`}>
                                    {renderTextWithBreaks(r.text)}
                                </React.Fragment>
                            ),
                        )}
                    </Formatted>
                )
            }
        } catch (e) {
            // fall through to simple parsing below
            log.error('Could not parse in ChatTextEvent', e)
        }
    }

    const segments = parseMessageText(content.body)
    return (
        <>
            {segments.map((segment, index) => (
                <React.Fragment key={index}>
                    {segment.type === 'text' ? (
                        renderTextWithRoomUnderline(segment.content)
                    ) : (
                        <ExternalLink
                            href={segment.content}
                            target="_blank"
                            rel="noopener noreferrer">
                            {segment.content}
                        </ExternalLink>
                    )}
                </React.Fragment>
            ))}
        </>
    )
}

const Formatted = styled('div', {
    whiteSpace: 'pre-wrap',
})

const A = styled('a', {
    textDecoration: 'underline',
    wordBreak: 'break-word',
    '&:hover': {
        opacity: 0.8,
    },
    '&.self-mention': {
        fontWeight: 700,
    },
})

const ExternalLink = styled('a', {
    textDecoration: 'underline',
    '&:hover': {
        opacity: 0.8,
    },
})

const Underline = styled('span', {
    textDecoration: 'underline',
})
