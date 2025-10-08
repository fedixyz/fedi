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
import { Checkbox } from '../Checkbox'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'

const log = makeLog('SocialBackupRecord')

interface Props {
    next(videoBlob: Blob): void
}

const VIDEO_FORMAT = 'video/webm;codecs=vp9'

export const SocialBackupRecord: React.FC<Props> = ({ next }) => {
    const { t } = useTranslation()
    const tRef = useUpdatingRef(t)
    const [error, setError] = useState<string>()
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
    const [isRecording, setIsRecording] = useState(false)
    const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
    const [isPlayingVideo, setIsPlayingVideo] = useState(false)
    const [isFaceConfirmed, setIsFaceConfirmed] = useState(false)
    const [isVoiceConfirmed, setIsVoiceConfirmed] = useState(false)

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
        if (
            typeof MediaRecorder === 'undefined' ||
            !MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ) {
            log.error('MediaRecorder or webm vp9 codec is not supported', {
                MediaRecorder: typeof MediaRecorder,
                isTypeSupported: MediaRecorder.isTypeSupported(
                    'video/webm;codecs=vp9',
                ),
            })
            setError(tRef.current('errors.browser-feature-not-supported'))
            return
        }
        // Then attempt to get camera access
        navigator.mediaDevices
            .getUserMedia({ video: true })
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
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: VIDEO_FORMAT,
        })
        const chunks: Blob[] = []
        mediaRecorder.addEventListener('dataavailable', e => {
            chunks.push(e.data)
        })
        mediaRecorder.addEventListener('stop', () => {
            setVideoBlob(new Blob(chunks, { type: VIDEO_FORMAT }))
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
            setIsPlayingVideo(false)
            videoEl.removeEventListener('ended', handleEnded)
        }
        videoEl.addEventListener('ended', handleEnded)
        videoEl.play()
        setIsPlayingVideo(true)
    }

    const handleReset = () => {
        setVideoBlob(null)
        setIsFaceConfirmed(false)
        setIsVoiceConfirmed(false)
    }

    const handleSubmit = () => {
        if (!videoBlob) return
        next(videoBlob)
    }

    const isReviewing = !!videoBlob
    const isShowingPlay = isReviewing && !isPlayingVideo

    return (
        <>
            <Layout.Content centered>
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
                                    ref={el => setVideoEl(el)}
                                    isFaded={!isRecording && !videoBlob}
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
                        <>
                            <Text variant="h2" weight="medium">
                                {t('feature.backup.please-review-backup-video')}
                            </Text>
                            <CheckboxContainer>
                                <Checkbox
                                    label={t(
                                        'feature.backup.review-face-confirmation',
                                    )}
                                    checked={isFaceConfirmed}
                                    onChange={setIsFaceConfirmed}
                                />
                                <Checkbox
                                    label={t(
                                        'feature.backup.review-voice-confirmation',
                                    )}
                                    checked={isVoiceConfirmed}
                                    onChange={setIsVoiceConfirmed}
                                />
                            </CheckboxContainer>
                        </>
                    ) : (
                        <>
                            <Text weight="medium">
                                {t('feature.backup.press-record-button')}
                            </Text>
                            <PromptContainer>
                                <PromptInner>
                                    <Text weight="bold">
                                        {t(
                                            'feature.backup.social-backup-video-prompt',
                                        )}
                                    </Text>
                                </PromptInner>
                            </PromptContainer>
                        </>
                    )}
                </Content>
            </Layout.Content>
            <Layout.Actions css={{ minHeight: 160 }}>
                {isReviewing ? (
                    <>
                        <Button
                            variant="tertiary"
                            width="full"
                            onClick={handleReset}>
                            {t('feature.backup.record-again')}
                        </Button>
                        <Button
                            variant="primary"
                            width="full"
                            disabled={!isFaceConfirmed || !isVoiceConfirmed}
                            onClick={handleSubmit}>
                            {t('feature.backup.confirm-backup-video')}
                        </Button>
                    </>
                ) : (
                    <RecordButton
                        isRecording={isRecording && !error}
                        onClick={() => setIsRecording(!isRecording)}>
                        <VisuallyHidden>
                            {isRecording
                                ? t('feature.backup.stop-recording')
                                : t('feature.backup.start-recording')}
                        </VisuallyHidden>
                    </RecordButton>
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

    variants: {
        isFaded: {
            true: {
                opacity: 0.7,
            },
        },
    },
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
    minWidth: 200,
    borderRadius: 16,
    padding: 2,
    fediGradient: 'sky-heavy',
})

const PromptInner = styled('div', {
    padding: 16,
    borderRadius: 14,
    background: theme.colors.white,
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

const CheckboxContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    textAlign: 'left',
    gap: 16,
})
