import NextLink from 'next/link'
import React from 'react'

import stringUtils from '@fedi/common/utils/StringUtils'
import { isDeepLink, parseTextWithUrls } from '@fedi/common/utils/linking'

import { styled, theme } from '../styles'
import { getDeepLinkPath } from '../utils/linking'

export const LinkifiedText: React.FC<{ text: string }> = ({ text }) => {
    return (
        <>
            {parseTextWithUrls(text).map((segment, i) => {
                if (segment.type === 'text') {
                    return (
                        <React.Fragment key={i}>
                            {segment.content}
                        </React.Fragment>
                    )
                }

                const inAppPath = isDeepLink(segment.content)
                    ? getDeepLinkPath(segment.content)
                    : undefined
                return (
                    <Link
                        key={i}
                        href={inAppPath ?? segment.content}
                        target={inAppPath ? undefined : '_blank'}
                        rel="noopener noreferrer">
                        {stringUtils.truncateString(segment.content, 75)}
                    </Link>
                )
            })}
        </>
    )
}

const Link = styled(NextLink, {
    color: theme.colors.link,
    textDecoration: 'underline',
    wordBreak: 'break-word',
})
