import { useRouter } from 'next/router'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import PlayIcon from '@fedi/common/assets/svgs/play.svg'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    approveSocialRecoveryRequest,
    selectAuthenticatedGuardian,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { Button } from '../../components/Button'
import { Column } from '../../components/Flex'
import { Icon } from '../../components/Icon'
import * as Layout from '../../components/Layout'
import Success from '../../components/Success'
import { Text } from '../../components/Text'
import {
    homeRoute,
    settingsCompleteRecoveryAssistRoute,
} from '../../constants/routes'
import { useRouteState } from '../../context/RouteStateContext'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { readBridgeFile } from '../../lib/bridge/'
import { keyframes, styled, theme } from '../../styles'

const log = makeLog('CompleteRecoveryAssist')

export function CompleteRecoveryAssist() {
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const router = useRouter()

    const videoRef = useRef<HTMLVideoElement>(null)

    const routeState = useRouteState(settingsCompleteRecoveryAssistRoute)

    const [videoSrc, setVideoSrc] = useState<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [loading, setLoading] = useState(false)
    const [confirmed, setConfirmed] = useState(false)
    const [rejected, setRejected] = useState(false)

    const authenticatedGuardian = useAppSelector(selectAuthenticatedGuardian)

    useEffect(() => {
        if (!authenticatedGuardian?.federationId || !routeState?.videoPath)
            return

        const downloadVideo = async () => {
            const result = await readBridgeFile(routeState.videoPath)

            const src = URL.createObjectURL(
                new Blob(
                    [
                        typeof result === 'string'
                            ? result
                            : Uint8Array.from(result),
                    ],
                    { type: 'video/mp4' },
                ),
            )

            setVideoSrc(src)
        }

        downloadVideo()
    }, [authenticatedGuardian?.federationId, routeState?.videoPath])

    const handleConfirm = async () => {
        if (!authenticatedGuardian?.federationId || !routeState?.recoveryId)
            return

        try {
            setLoading(true)

            await dispatch(
                approveSocialRecoveryRequest({
                    fedimint,
                    recoveryId: routeState.recoveryId,
                    peerId: authenticatedGuardian.peerId,
                    federationId: authenticatedGuardian.federationId,
                }),
            ).unwrap()

            setConfirmed(true)
        } catch (error) {
            const typedError = error
            log.error('handleGuardianApproval', typedError)
            toast.error(t, error)
        } finally {
            setLoading(false)
        }
    }

    const handleReject = () => {
        setRejected(true)
    }

    const handleOnLoad = () => {
        if (!videoRef.current) return

        videoRef.current.currentTime = 0.1
        videoRef.current.pause()
    }

    const handleOnPlay = () => {
        if (!videoRef.current) return

        setIsPlaying(true)
        videoRef.current.muted = false
        videoRef.current.play()
    }

    const handleOnEnded = () => {
        if (!videoRef.current) return

        setIsPlaying(false)
        videoRef.current.muted = true
    }

    if (confirmed) {
        return (
            <Success
                title={t('words.confirmed')}
                description={t(
                    'feature.recovery.recovery-assist-confirmation-success',
                )}
                buttonText={t('words.done')}
                onClick={() => router.push(homeRoute)}
            />
        )
    }

    if (rejected) {
        return (
            <Success
                title={t('words.rejected')}
                description={t(
                    'feature.recovery.recovery-assist-confirmation-error',
                )}
                buttonText={t('words.done')}
                onClick={() => router.push(homeRoute)}
                type="error"
            />
        )
    }

    return (
        <Layout.Root>
            <Layout.Header back>
                <Layout.Title subheader>
                    {t('feature.recovery.recovery-assist')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Content>
                    <Column align="center" gap="lg">
                        <Text
                            variant="h2"
                            weight="medium"
                            center
                            css={{ lineHeight: 1.1 }}>
                            {t(
                                'feature.recovery.recovery-assist-confirm-title',
                            )}
                        </Text>
                        <Text
                            variant="caption"
                            center
                            css={{ color: theme.colors.darkGrey }}>
                            {t(
                                'feature.recovery.recovery-assist-confirm-question',
                            )}
                        </Text>
                        {videoSrc && (
                            <VideoContainer
                                onClick={handleOnPlay}
                                playing={isPlaying}>
                                <VideoWrapper>
                                    {!isPlaying && (
                                        <PlayButtonWrapper>
                                            <PlayButton
                                                icon={PlayIcon}
                                                size="md"
                                            />
                                        </PlayButtonWrapper>
                                    )}
                                    <Video
                                        src={videoSrc}
                                        ref={videoRef}
                                        muted
                                        playsInline
                                        autoPlay
                                        preload="metadata"
                                        aria-label="video"
                                        controls={false}
                                        onLoadedData={handleOnLoad}
                                        onEnded={handleOnEnded}
                                    />
                                </VideoWrapper>
                            </VideoContainer>
                        )}
                    </Column>
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Button
                    width="full"
                    onClick={handleConfirm}
                    loading={loading}
                    disabled={loading}>
                    {t('words.continue')}
                </Button>
                <Button
                    variant="outline"
                    width="full"
                    onClick={handleReject}
                    disabled={loading}>
                    {t('words.reject')}
                </Button>
            </Layout.Actions>
        </Layout.Root>
    )
}

const fadeIn = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const Content = styled('div', {
    padding: theme.spacing.md,
})

const VideoContainer = styled('div', {
    animation: `${fadeIn} 200ms ease`,
    aspectRatio: '1 / 1',
    border: `2px solid ${theme.colors.lightGrey}`,
    borderRadius: '100%',
    maxWidth: 320,
    padding: theme.spacing.md,
    position: 'relative',
    width: '100%',

    variants: {
        playing: {
            true: {
                borderColor: theme.colors.green,
            },
        },
    },
})

const VideoWrapper = styled('div', {
    aspectRatio: '1/1',
    borderRadius: '100%',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
})

const Video = styled('video', {
    display: 'block',
    height: '100%',
    objectFit: 'cover',
    width: '100%',
})

const PlayButtonWrapper = styled('div', {
    borderRadius: '50%',
    left: '50%',
    padding: 10,
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
})

const PlayButton = styled(Icon, {
    color: theme.colors.white,
    height: 40,
    pointerEvents: 'none',
    width: 40,
})
