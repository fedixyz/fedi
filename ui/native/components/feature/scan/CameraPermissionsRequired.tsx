import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet } from 'react-native'
import { Camera } from 'react-native-vision-camera'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import { Column } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const log = makeLog('RequestCameraAccess')

export type RequestCameraAccessProps = {
    alternativeActionButton: React.ReactNode | null
    message: string | null
    onAccessGranted?: () => void | null
    requireMicrophone?: boolean
    children?: React.ReactNode
}

const RequestCameraAccess: React.FC<RequestCameraAccessProps> = ({
    alternativeActionButton,
    message,
    onAccessGranted,
    requireMicrophone = false,
    children,
}: RequestCameraAccessProps) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { theme } = useTheme()
    const [cameraPermissionGranted, setCameraPermissionGranted] =
        useState<boolean>(false)
    const [microphonePermissionGranted, setMicrophonePermissionGranted] =
        useState<boolean>(false)
    const [isRequestingPermission, setIsRequestingPermission] = useState(false)

    useEffect(() => {
        if (
            requireMicrophone &&
            cameraPermissionGranted &&
            microphonePermissionGranted
        ) {
            onAccessGranted?.()
        } else if (!requireMicrophone && cameraPermissionGranted) {
            onAccessGranted?.()
        }
    }, [
        onAccessGranted,
        cameraPermissionGranted,
        microphonePermissionGranted,
        requireMicrophone,
    ])

    const requestCameraPermission = async () => {
        const requestResult = await Camera.requestCameraPermission()
        log.info('cameraRequestResult: ', requestResult)
        if (requestResult === 'granted') {
            setCameraPermissionGranted(true)
        }

        const status = await Camera.getCameraPermissionStatus()
        log.info('cameraRequestResult:', status)
        // User explicitly denied... link to Settings instead
        if (status === 'denied') {
            Linking.openSettings()
        }
    }

    const requestMicrophonePermission = async () => {
        const requestResult = await Camera.requestMicrophonePermission()
        log.info('microphoneRequestResult: ', requestResult)
        if (requestResult === 'granted') {
            setMicrophonePermissionGranted(true)
        }

        const status = await Camera.getMicrophonePermissionStatus()
        log.info('microphoneRequestResult:', status)
        // User explicitly denied... link to Settings instead
        if (status === 'denied') {
            Linking.openSettings()
        }
    }

    const requestPermissions = async () => {
        setIsRequestingPermission(true)
        try {
            await requestCameraPermission()
            if (requireMicrophone) {
                await requestMicrophonePermission()
            }
        } catch (err) {
            toast.error(t, err)
        }
        setIsRequestingPermission(false)
    }

    const style = styles(theme)

    if (
        cameraPermissionGranted &&
        (!requireMicrophone || microphonePermissionGranted)
    ) {
        return <>{children}</> // Render children when permissions are granted
    }

    return (
        <Column grow align="center" justify="between" style={style.container}>
            <Column grow center>
                <SvgImage name="AllowCameraAccessIcon" size={SvgImageSize.lg} />
                <Text h2 style={style.titleText}>
                    {t('phrases.allow-camera-access')}
                </Text>
                <Text style={style.subtitleText}>{message}</Text>
            </Column>
            <Column justify="between" fullWidth style={style.buttonsContainer}>
                {alternativeActionButton}
                <Button
                    title={t('phrases.allow-camera-access')}
                    onPress={requestPermissions}
                    loading={isRequestingPermission}
                />
            </Column>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingBottom: theme.spacing.xl,
        },
        buttonsContainer: {
            paddingHorizontal: theme.spacing.xl,
        },
        image: {
            height: 90,
            width: 90,
            resizeMode: 'contain',
        },
        titleText: {
            fontWeight: '600',
            margin: theme.spacing.md,
            textAlign: 'center',
        },
        subtitleText: {
            textAlign: 'center',
            marginHorizontal: theme.spacing.xl,
        },
    })

export default RequestCameraAccess
