import { styled } from '@stitches/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import Plus from '@fedi/common/assets/svgs/plus.svg'
import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import { theme } from '../../styles'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { FilePreview } from './FilePreview'

export type FileData = {
    id: string
    base64: string
    preview?: string
    width: number
    height: number
    size: number
    type: string
    fileName: string
}

const log = makeLog('FileUploader')

export const FileUploader = ({
    files,
    setFiles,
}: {
    files: Array<FileData>
    setFiles: React.Dispatch<React.SetStateAction<FileData[]>>
}) => {
    const toast = useToast()
    const { t } = useTranslation()
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const evtFiles = event.target.files
        if (!evtFiles) return

        Array.from(evtFiles).forEach(file => {
            const reader = new FileReader()
            reader.onloadend = () => {
                if (file.type.startsWith('image/')) {
                    const image = new Image()
                    image.src = reader.result as string
                    image.onload = () => {
                        setFiles(prev => [
                            ...prev,
                            {
                                id: Math.random().toString(36).slice(2),
                                base64: (reader.result as string).split(',')[1],
                                preview: reader.result as string,
                                width: image.width,
                                height: image.height,
                                size: file.size,
                                type: file.type,
                                fileName: file.name,
                            },
                        ])
                    }
                } else if (file.type.startsWith('video/')) {
                    applyVideo(file, reader.result as string)
                } else {
                    toast.show('Invalid file type provided')
                }
            }

            reader.readAsDataURL(file)
        })

        event.target.value = ''
    }

    /**
     * Adds a video file to the `files` state variable and uses the first frame as a preview image.
     */
    const applyVideo = async (file: File, base64: string) => {
        try {
            const video = document.createElement('video')
            video.src = base64

            video.load()

            video.addEventListener('canplaythrough', () => {
                const canvas = document.createElement('canvas')
                const { videoWidth: width, videoHeight: height } = video

                canvas.width = width
                canvas.height = height

                const ctx = canvas.getContext('2d')
                if (ctx) {
                    ctx.drawImage(video, 0, 0, width, height)
                    video.remove()
                }

                const previewBase64 = canvas.toDataURL()

                setFiles(prev => [
                    ...prev,
                    {
                        id: Math.random().toString(36).slice(2),
                        base64: base64.split(',')[1],
                        preview: previewBase64,
                        width,
                        height,
                        size: file.size,
                        type: file.type,
                        fileName: file.name,
                    },
                ])

                canvas.remove()
            })

            await video.play()
        } catch (e) {
            log.error('Could not play video', e)

            setFiles(prev => [
                ...prev,
                {
                    id: Math.random().toString(36).slice(2),
                    base64: base64.split(',')[1],
                    width: 100,
                    height: 100,
                    size: file.size,
                    type: file.type,
                    fileName: file.name,
                },
            ])
        }
    }

    /**
     * Removes a file from the `files` state variable by its ID
     */
    const handleRemoveFile = (id: string) => {
        setFiles(prev => prev.filter(file => file.id !== id))
    }

    return (
        <Container>
            {files.map(file => (
                <FilePreview
                    key={file.id}
                    fileData={file}
                    onRemove={handleRemoveFile}
                />
            ))}
            <FileInput
                type="file"
                onChange={handleFileChange}
                accept="image/*, video/*"
                id="file-input"
                tabIndex={-1}
                aria-hidden="true"
                multiple
            />
            <FileTrigger htmlFor="file-input">
                <Icon icon={Plus} size="xs" />
                <Text weight="medium">{t('words.upload')}</Text>
            </FileTrigger>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
})

const FileInput = styled('input', {
    opacity: 0,
    position: 'absolute',
    zIndex: -1,
    top: 0,
    left: 0,
    width: 1,
    height: 1,
})

const FileTrigger = styled('label', {
    background: theme.colors.blue100,
    borderRadius: theme.sizes.lg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    gap: theme.spacing.sm,
    cursor: 'pointer',
    transition: 'opacity 100ms ease',
    willChange: 'opacity',

    '&:active': {
        opacity: 0.5,
    },
})
