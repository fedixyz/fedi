import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import PlayIcon from '@fedi/common/assets/svgs/play.svg'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { makeLog } from '@fedi/common/utils/log'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'

const log = makeLog('SocialBackupRecord')

interface Props {
    back(): void
    next(videoBlob: Blob): void
}

function getSupportedVideoType() {
    if (typeof MediaRecorder === 'undefined') return null

    const types = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/mp4',
    ]

    return types.find(type => MediaRecorder.isTypeSupported(type)) || null
}

export const SocialBackupRecord: React.FC<Props> = ({ next, back }) => {
    const { t } = useTranslation()
    const tRef = useUpdatingRef(t)
    const [error, setError] = useState<string>()
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
    const [isRecording, setIsRecording] = useState(false)
    const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
    const [isPlayingVideo, setIsPlayingVideo] = useState(false)

    // Kill stream tracks when it changes or on unmount
    useEffect(() => {
        if (!stream) return
        return () => stream.getTracks().forEach(track => track.stop())
    }, [stream])

    // Hook up steam to the video element when available
    useEffect(() => {
        if (!videoEl || !stream) return
        videoEl.src = ''
        videoEl.srcObject = stream
        videoEl.play()
    }, [stream, videoEl])

    // Hook up the blob to the video element when available
    useEffect(() => {
        if (!videoEl || !videoBlob) return
        videoEl.srcObject = null
        videoEl.src = URL.createObjectURL(videoBlob)
        videoEl.pause()
        videoEl.currentTime = 0
    }, [videoBlob, videoEl])

    // Grab the camera when we're ready to record
    useEffect(() => {
        if (videoBlob) return
        // First check if their browser supports recording video
        if (!getSupportedVideoType()) {
            log.error('MediaRecorder or webm vp9 codec is not supported', {
                MediaRecorder: typeof MediaRecorder,
            })
            setError(tRef.current('errors.browser-feature-not-supported'))
            return
        }
        // Then attempt to get camera access
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then(setStream)
            .catch(err => {
                log.error('getUserMedia', err)
                setError(
                    formatErrorMessage(
                        tRef.current,
                        err,
                        'errors.camera-unavailable',
                    ),
                )
            })
    }, [tRef, videoBlob])

    // When the user wants to record, fire up the MediaRecorder. When they don't want it, stop and save.
    useEffect(() => {
        if (!isRecording || !stream) return

        const videoFormat = getSupportedVideoType()

        if (!videoFormat) return

        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: videoFormat,
        })
        const chunks: Blob[] = []
        mediaRecorder.addEventListener('dataavailable', e => {
            chunks.push(e.data)
        })
        mediaRecorder.addEventListener('stop', () => {
            setVideoBlob(new Blob(chunks, { type: videoFormat }))
            setIsRecording(false)
        })
        mediaRecorder.addEventListener('error', err => {
            log.error('mediaRecorder error event', err)
            setError(
                formatErrorMessage(tRef.current, err, 'errors.unknown-error'),
            )
            setIsRecording(false)
        })
        try {
            mediaRecorder.start()
        } catch (err) {
            log.error('mediaRecorder.start error', err)
            setError(
                formatErrorMessage(tRef.current, err, 'errors.unknown-error'),
            )
        }

        // Stop recording after 10s, or when isRecording is false
        let stopped = false
        const timeout = setTimeout(() => {
            stopped = true
            mediaRecorder.stop()
        }, 10000)
        return () => {
            if (stopped) return
            mediaRecorder.stop()
            clearTimeout(timeout)
        }
    }, [stream, isRecording, tRef])

    // Handle playing the video. Hide the play button when while the video is playing back.
    const handlePlay = (ev: React.MouseEvent) => {
        ev.preventDefault()
        if (!videoEl) return

        const handleEnded = () => {
            videoEl.muted = true
            setIsPlayingVideo(false)
            videoEl.removeEventListener('ended', handleEnded)
        }
        videoEl.addEventListener('ended', handleEnded)
        videoEl.muted = false
        videoEl.play()
        setIsPlayingVideo(true)
    }

    const handleReset = () => {
        setVideoBlob(null)
    }

    const handleSubmit = () => {
        if (!videoBlob) return
        next(videoBlob)
    }

    const isReviewing = !!videoBlob
    const isShowingPlay = isReviewing && !isPlayingVideo

    return (
        <>
            <Layout.Header back={back}>
                <Layout.Title subheader>
                    {t('feature.backup.social-backup')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Content>
                    <VideoContainer isRed={isRecording || !!error}>
                        <VideoInner>
                            {error ? (
                                <Error>
                                    <Icon icon={ErrorIcon} />
                                    <Text>{error}</Text>
                                </Error>
                            ) : (
                                <Video
                                    muted
                                    ref={el => setVideoEl(el)}
                                    playsInline
                                    webkit-playsinline="true"
                                    controls={false}
                                />
                            )}
                            {isShowingPlay && (
                                <PlayButton onClick={handlePlay}>
                                    <Icon
                                        icon={PlayIcon}
                                        onClick={handlePlay}
                                    />
                                </PlayButton>
                            )}
                        </VideoInner>
                    </VideoContainer>
                    {isReviewing ? (
                        <Text center css={{ color: theme.colors.darkGrey }}>
                            {t('feature.backup.confirm-video-text')}
                        </Text>
                    ) : (
                        <>
                            <Text css={{ color: theme.colors.darkGrey }}>
                                {t('feature.backup.record-video-tip')}
                            </Text>
                            <Text css={{ color: theme.colors.darkGrey }}>
                                {t('feature.backup.record-video-prompt')}
                            </Text>
                            <PromptContainer>
                                <Text weight="medium" variant="caption">
                                    {t('feature.backup.record-video-sentence')}
                                </Text>
                            </PromptContainer>
                        </>
                    )}
                </Content>
            </Layout.Content>
            <Layout.Actions css={{ minHeight: 160 }}>
                {isReviewing ? (
                    <>
                        <Button
                            variant="primary"
                            width="full"
                            onClick={handleSubmit}>
                            {t('feature.backup.confirm-backup-video')}
                        </Button>
                        <Button
                            variant="tertiary"
                            width="full"
                            onClick={handleReset}>
                            {t('feature.backup.record-again')}
                        </Button>
                    </>
                ) : (
                    <>
                        <Text
                            variant="small"
                            css={{ color: theme.colors.darkGrey }}>
                            {isRecording
                                ? t(
                                      'feature.backup.record-video-press-stop-text',
                                  )
                                : t('feature.backup.record-video-press-text')}
                        </Text>

                        <RecordButton
                            isRecording={isRecording && !error}
                            onClick={() => setIsRecording(!isRecording)}>
                            <VisuallyHidden>
                                {isRecording
                                    ? t('feature.backup.stop-recording')
                                    : t('feature.backup.start-recording')}
                            </VisuallyHidden>
                        </RecordButton>
                    </>
                )}
            </Layout.Actions>
        </>
    )
}

const Content = styled('div', {
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    textAlign: 'center',
    width: '100%',
    gap: 16,
})

const VideoContainer = styled('div', {
    flexShrink: 0,
    position: 'relative',
    width: '100%',
    maxWidth: 320,
    aspectRatio: '1/1',
    padding: 2,
    fediGradient: 'sky',
    borderRadius: '100%',
    transition: 'opacity 100ms ease',

    variants: {
        isRed: {
            true: {
                background: theme.colors.red,
            },
        },
    },
})

const VideoInner = styled('div', {
    width: '100%',
    height: '100%',
    borderRadius: '100%',
    background: theme.colors.white,
})

const Video = styled('video', {
    width: '100%',
    height: '100%',
    borderRadius: '100%',
    objectFit: 'cover',
    border: `16px solid ${theme.colors.white}`,
    background: theme.colors.extraLightGrey,
    transition: 'opacity 200ms ease',
})

const PlayButton = styled('button', {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.8,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'none',
    color: '#FFF',

    '&:hover, &:focus': {
        opacity: 1,
        outline: 'none',
    },
})

const Error = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    width: '100%',
    height: '100%',
    borderRadius: '100%',
    gap: 16,
    background: theme.colors.extraLightGrey,
    border: `16px solid ${theme.colors.white}`,
})

const PromptContainer = styled('div', {
    borderRadius: 4,
    padding: theme.spacing.md,
    fediGradient: 'sky',
})

const RecordButton = styled('button', {
    height: 64,
    minWidth: 64,
    padding: '16px 24px',
    borderRadius: 32,
    color: theme.colors.white,
    background: theme.colors.primary,
    border: `3px solid ${theme.colors.white}`,
    boxShadow: `0 0 0 6px ${theme.colors.primary}`,

    '&:hover, &:focus': {
        opacity: 0.8,
    },
    '&:active': {
        opacity: 1,
    },

    variants: {
        isRecording: {
            true: {
                backgroundColor: theme.colors.red,
                boxShadow: `0 0 0 6px ${theme.colors.red}`,
            },
        },
    },
})
