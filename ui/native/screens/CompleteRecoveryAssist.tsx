import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import Video, { VideoRef } from 'react-native-video'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    approveSocialRecoveryRequest,
    selectAuthenticatedGuardian,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'
import { prefixFileUri } from '@fedi/common/utils/media'

import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('CompleteRecoveryAssist')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'CompleteRecoveryAssist'
>

const CompleteRecoveryAssist: React.FC<Props> = ({
    navigation,
    route,
}: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()
    const { videoPath, recoveryId } = route.params
    const [isPaused, setIsPaused] = useState(true)
    const [loading, setLoading] = useState(false)
    const videoRef = useRef<VideoRef | null>(null)

    const authenticatedGuardian = useAppSelector(selectAuthenticatedGuardian)

    const handleConfirm = async () => {
        if (!authenticatedGuardian?.federationId) return

        try {
            setLoading(true)

            const result = await dispatch(
                approveSocialRecoveryRequest({
                    fedimint,
                    recoveryId,
                    peerId: authenticatedGuardian.peerId,
                    federationId: authenticatedGuardian.federationId,
                }),
            )

            if (result?.meta?.requestStatus !== 'fulfilled') {
                throw new Error(
                    t('feature.recovery.recovery-assist-error-message'),
                )
            }

            navigation.replace('RecoveryAssistConfirmation', {
                type: 'success',
            })
        } catch (error) {
            const typedError = error as Error
            log.error('handleGuardianApproval', typedError)
            toast.error(t, error)
        } finally {
            setLoading(false)
        }
    }

    const handleReject = () => {
        navigation.replace('RecoveryAssistConfirmation', { type: 'error' })
    }

    const style = styles(theme)

    return (
        <SafeAreaContainer edges={'bottom'}>
            <Column style={style.container}>
                <Column align="center" gap="lg" grow>
                    <Text center style={style.title}>
                        {t('feature.recovery.recovery-assist-confirm-title')}
                    </Text>
                    <Text caption center style={style.subtitle}>
                        {t('feature.recovery.recovery-assist-confirm-question')}
                    </Text>
                    <View style={style.videoContainer}>
                        <View style={style.videoWrapper}>
                            <Video
                                ref={videoRef}
                                source={{ uri: prefixFileUri(videoPath) }} // Can be a URL or a local file.
                                style={[
                                    style.video,
                                    isPaused ? style.shaded : {},
                                ]}
                                paused={isPaused}
                                resizeMode="cover"
                                ignoreSilentSwitch={'ignore'}
                                onError={error => {
                                    log.error('Video onError', error)
                                }}
                                onEnd={() => setIsPaused(true)}
                            />
                        </View>
                        {isPaused && (
                            <Pressable
                                style={style.playIconContainer}
                                onPress={() => {
                                    videoRef.current?.seek(0)
                                    setIsPaused(false)
                                }}>
                                <SvgImage
                                    name="Play"
                                    color={theme.colors.white}
                                    size={SvgImageSize.lg}
                                />
                            </Pressable>
                        )}
                    </View>
                </Column>

                <Text small style={{ color: theme.colors.darkGrey }}>
                    {t('feature.recovery.recovery-assist-hold-to-confirm')}
                </Text>
                <Button
                    fullWidth
                    onLongPress={handleConfirm}
                    title={t('words.confirm')}
                    loading={loading}
                />
                <Button
                    type="outline"
                    fullWidth
                    onLongPress={handleReject}
                    title={t('words.reject')}
                    loading={loading}
                />
            </Column>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) => {
    const SIZE = theme.sizes.socialBackupCameraWidth
    const PADDING = 20

    return StyleSheet.create({
        container: {
            alignItems: 'center',
            flex: 1,
            gap: theme.spacing.lg,
            padding: theme.spacing.lg,
        },
        title: {
            fontSize: 24,
            fontWeight: '500',
        },
        subtitle: {
            color: theme.colors.darkGrey,
            fontSize: 15,
        },
        videoContainer: {
            alignItems: 'center',
            borderColor: theme.colors.green,
            borderRadius: SIZE / 2,
            borderWidth: 2,
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
            padding: theme.spacing.md,
            height: SIZE,
            width: SIZE,
        },
        videoWrapper: {
            height: SIZE - PADDING,
            width: SIZE - PADDING,
            borderRadius: (SIZE - PADDING) / 2,
            overflow: 'hidden',
        },
        video: {
            height: '100%',
            width: '100%',
        },
        playIconContainer: {
            position: 'absolute',
            justifyContent: 'center',
            alignItems: 'center',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
        },
        shaded: {
            backgroundColor: theme.colors.lightGrey,
        },
    })
}

export default CompleteRecoveryAssist
