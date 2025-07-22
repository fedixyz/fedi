import React from 'react'

import { MatrixEvent } from '@fedi/common/types'
import { parseMessageText } from '@fedi/common/utils/chat'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'

import { styled } from '../../styles'

interface Props {
    event: MatrixEvent<MatrixEventContentType<'m.text'>>
}

const renderTextWithBreaks = (text: string) => {
    return text.split(/\r?\n/).map((part, index, array) => (
        <React.Fragment key={index}>
            {part}
            {index !== array.length - 1 && <br />}
        </React.Fragment>
    ))
}

export const ChatTextEvent: React.FC<Props> = ({ event }) => {
    const { body } = event.content
    const segments = parseMessageText(body)

    return (
        <>
            {segments.map((segment, index) => (
                <React.Fragment key={index}>
                    {segment.type === 'text' ? (
                        renderTextWithBreaks(segment.content)
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

const ExternalLink = styled('a', {
    textDecoration: 'underline',
    '&:hover': {
        opacity: 0.8,
    },
})
