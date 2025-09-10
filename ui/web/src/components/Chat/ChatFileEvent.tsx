import React from 'react'

import DownloadIcon from '@fedi/common/assets/svgs/download.svg'
import FileIcon from '@fedi/common/assets/svgs/file.svg'
import { MatrixEvent } from '@fedi/common/types'
import stringUtils from '@fedi/common/utils/StringUtils'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'
import { formatFileSize } from '@fedi/common/utils/media'

import { Icon } from '../../components/Icon'
import { Text } from '../../components/Text'
import { useLoadMedia } from '../../hooks/media'
import { styled, theme } from '../../styles'
import { downloadFile } from '../../utils/media'

interface Props {
    event: MatrixEvent<MatrixEventContentType<'m.file'>>
}

export const ChatFileEvent: React.FC<Props> = ({ event }) => {
    const { src } = useLoadMedia(event)

    if (!src) return null

    return (
        <AttachmentWrapper aria-label="file">
            <FileIconSection>
                <FileIconWrapper>
                    <Icon icon={FileIcon} size="sm" />
                </FileIconWrapper>
            </FileIconSection>
            <TextContent>
                <Text variant="body" weight="bold">
                    {stringUtils.truncateMiddleOfString(event.content.body, 10)}
                </Text>
                <Text variant="small" css={{ color: theme.colors.darkGrey }}>
                    {formatFileSize(event.content.info.size ?? 0)}
                </Text>
            </TextContent>
            <DownloadIconSection>
                <DownloadIconWrapper
                    aria-label="download-button"
                    onClick={() => downloadFile(src, event.content.body)}>
                    <Icon icon={DownloadIcon} size="xs" />
                </DownloadIconWrapper>
            </DownloadIconSection>
        </AttachmentWrapper>
    )
}

const AttachmentWrapper = styled('div', {
    alignItems: 'center',
    background: theme.colors.offWhite,
    borderRadius: theme.sizes.xxs,
    display: 'flex',
    height: 60,
    gap: 8,
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: 8,
    width: '100%',
})

const FileIconSection = styled('div', {
    alignItems: 'center',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    width: 40,
})

const FileIconWrapper = styled('div', {
    alignItems: 'center',
    background: theme.colors.extraLightGrey,
    borderRadius: 8,
    display: 'flex',
    height: 40,
    justifyContent: 'center',
    width: 40,
})

const TextContent = styled('div', {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    textAlign: 'left',
})

const DownloadIconSection = styled('div', {
    alignItems: 'center',
    borderRadius: '50%',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    width: 40,
})

const DownloadIconWrapper = styled('div', {
    alignItems: 'center',
    border: `1px solid ${theme.colors.lightGrey}`,
    borderRadius: '50%',
    display: 'flex',
    height: 40,
    justifyContent: 'center',
    width: 40,
})
