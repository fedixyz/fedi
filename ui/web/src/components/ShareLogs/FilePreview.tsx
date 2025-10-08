import { styled } from '@stitches/react'
import * as React from 'react'

import Close from '@fedi/common/assets/svgs/close.svg'
import Video from '@fedi/common/assets/svgs/video.svg'
import { theme as themeColors } from '@fedi/common/constants/theme'

import { theme } from '../../styles'
import { Icon } from '../Icon'
import { FileData } from './FileUploader'

type FilePreviewProps = {
    fileData: FileData
    onRemove: (id: string) => void
}

export const FilePreview: React.FC<FilePreviewProps> = ({
    fileData,
    onRemove,
}) => {
    return (
        <Container
            style={
                fileData.preview
                    ? {
                          backgroundImage: `url(${fileData.preview})`,
                      }
                    : undefined
            }>
            <CloseButton onClick={() => onRemove(fileData.id)}>
                <Icon icon={Close} size="xs" />
            </CloseButton>
            {fileData.preview ? null : (
                <Icon icon={Video} color={themeColors.colors.grey} />
            )}
        </Container>
    )
}

const Container = styled('div', {
    position: 'relative',
    borderRadius: theme.spacing.xs,
    width: 44,
    height: 44,
    display: 'grid',
    placeItems: 'center',
    backgroundColor: theme.colors.extraLightGrey,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
})

const CloseButton = styled('button', {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 16,
    height: 16,
    borderRadius: theme.spacing.lg,
    diplay: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.black,
    color: theme.colors.white,
})
