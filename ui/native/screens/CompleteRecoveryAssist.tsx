import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Video, { VideoRef } from 'react-native-video'

import { useToast } from '@fedi/common/hooks/toast'
import {
    approveSocialRecoveryRequest,
    selectActiveFederationId,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import CheckBox from '../components/ui/CheckBox'
import LineBreak from '../components/ui/LineBreak'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'
import { prefixFileUri } from '../utils/media'

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
    const federationId = useAppSelector(selectActiveFederationId)
    const dispatch = useAppDispatch()
    const toast = useToast()
    const { videoPath, recoveryId } = route.params
    const [isPaused, setIsPaused] = useState(true)
    const [approvalSelected, setApprovalSelected] = useState(false)
    const [denialSelected, setDenialSelected] = useState(false)
    const [approvalInProgress, setApprovalInProgress] = useState(false)
    const videoRef = useRef<VideoRef | null>(null)

    const authenticatedGuardian = useAppSelector(
        s => s.federation.authenticatedGuardian,
    )

    const handleGuardianDenial = async () => {
        // FIXME: seeing a success screen when you deny someone is a little unexpected
        navigation.replace('RecoveryAssistSuccess')
    }

    useEffect(() => {
        const handleGuardianApproval = async () => {
            try {
                // FIXME: hard-coded to be peerId 0 each time.
                if (authenticatedGuardian && federationId) {
                    await dispatch(
                        approveSocialRecoveryRequest({
                            fedimint,
                            recoveryId,
                            peerId: authenticatedGuardian.peerId,
                            password: authenticatedGuardian.password,
                            federationId,
                        }),
                    )
                    navigation.replace('RecoveryAssistSuccess')
                }
            } catch (error) {
                const typedError = error as Error
                log.error('handleGuardianApproval', typedError)
                toast.error(t, error)
            }
            setApprovalInProgress(false)
        }
        if (approvalInProgress === true) {
            handleGuardianApproval()
        }
    }, [
        approvalInProgress,
        authenticatedGuardian,
        navigation,
        recoveryId,
        toast,
        t,
        dispatch,
        federationId,
    ])

    return (
        <ScrollView contentContainerStyle={styles(theme).container}>
            <View style={styles(theme).cameraContainer}>
                <Video
                    ref={videoRef}
                    source={{ uri: prefixFileUri(videoPath) }} // Can be a URL or a local file.
                    style={[
                        styles(theme).video,
                        isPaused ? styles(theme).shaded : {},
                    ]}
                    paused={isPaused}
                    resizeMode={'contain'}
                    ignoreSilentSwitch={'ignore'}
                    onError={error => {
                        log.error('Video onError', error)
                    }}
                    onEnd={() => setIsPaused(true)}
                />
                {isPaused && (
                    <Pressable
                        style={styles(theme).playIconContainer}
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

            <LineBreak />
            <ScrollView>
                <Text bold style={styles(theme).instructionsText}>
                    {t(
                        'feature.recovery.recovery-confirm-identity-instructions-1',
                    )}
                </Text>
                <LineBreak />
                <Text bold style={styles(theme).instructionsText}>
                    {t(
                        'feature.recovery.recovery-confirm-identity-instructions-2',
                    )}
                </Text>
                <LineBreak />
                <View style={styles(theme).confirmationContainer}>
                    <CheckBox
                        title={
                            <Text
                                caption
                                medium
                                style={styles(theme).checkboxText}>
                                {t(
                                    'feature.recovery.recovery-confirm-identity-yes',
                                )}
                            </Text>
                        }
                        checkedIcon={<SvgImage name="RadioSelected" />}
                        uncheckedIcon={<SvgImage name="RadioUnselected" />}
                        checked={approvalSelected}
                        onPress={() => {
                            setApprovalSelected(true)
                            setDenialSelected(false)
                        }}
                    />
                    <CheckBox
                        title={
                            <Text
                                caption
                                medium
                                style={styles(theme).checkboxText}>
                                {t(
                                    'feature.recovery.recovery-confirm-identity-no',
                                )}
                            </Text>
                        }
                        checkedIcon={<SvgImage name="RadioSelected" />}
                        uncheckedIcon={<SvgImage name="RadioUnselected" />}
                        checked={denialSelected}
                        onPress={() => {
                            setApprovalSelected(false)
                            setDenialSelected(true)
                        }}
                    />
                </View>
            </ScrollView>

            <Button
                title={t('words.continue')}
                onPress={() => {
                    if (approvalSelected) {
                        setApprovalInProgress(true)
                    } else {
                        handleGuardianDenial()
                    }
                }}
                loading={approvalInProgress}
                disabled={!approvalSelected && !denialSelected}
                containerStyle={styles(theme).confirmButton}
            />
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            paddingVertical: theme.spacing.xl,
        },
        cameraContainer: {
            height: theme.sizes.socialBackupCameraHeight,
            width: theme.sizes.socialBackupCameraWidth,
            borderWidth: 1,
        },
        camera: {
            height: '100%',
            width: '100%',
        },
        checkboxText: {
            paddingHorizontal: theme.spacing.md,
            textAlign: 'left',
        },
        confirmButton: {
            marginTop: theme.spacing.lg,
            width: '90%',
        },
        confirmationContainer: {
            flex: 1,
            alignItems: 'flex-start',
            paddingHorizontal: theme.spacing.md,
            marginHorizontal: 0,
        },
        instructionsText: {
            alignSelf: 'flex-start',
            textAlign: 'left',
            paddingHorizontal: theme.spacing.xl,
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
            backgroundColor: theme.colors.grey,
        },
        video: {
            height: '100%',
            width: '100%',
        },
    })

export default CompleteRecoveryAssist
