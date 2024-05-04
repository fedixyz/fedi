import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ScanSadIcon from '@fedi/common/assets/svgs/scan-sad.svg'
import ScanIcon from '@fedi/common/assets/svgs/scan.svg'
import { useToast } from '@fedi/common/hooks/toast'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { HoloLoader } from '../HoloLoader'
import { Icon } from '../Icon'
import { QRScanner, ScanResult } from '../QRScanner'
import { Text } from '../Text'

interface Props {
    processing?: boolean
    onScan(data: string): void
}

export const OmniQrScanner: React.FC<Props> = ({ processing, onScan }) => {
    const { t } = useTranslation()
    const [cameraPermission, setCameraPermission] = useState<PermissionState>()
    const toast = useToast()

    useEffect(() => {
        // Not all browsers support querying for camera permission, so it's
        // not properly typed. Force the type, and if it throws, assume they
        // don't have permission.
        navigator.permissions
            .query({ name: 'camera' as PermissionName })
            .then(status => {
                setCameraPermission(status.state)
            })
            .catch(() => setCameraPermission('prompt'))
    }, [])

    const handleScan = useCallback(
        (result: ScanResult) => {
            onScan(result.data)
        },
        [onScan],
    )

    const handleRequestCameraPermission = useCallback(() => {
        navigator.mediaDevices
            .getUserMedia({ video: true })
            .then(stream => {
                stream.getTracks().forEach(track => track.stop())
                setCameraPermission('granted')
            })
            .catch(err => {
                toast.error(t, err, 'errors.camera-unavailable')
            })
    }, [toast, t])

    if (cameraPermission === 'granted') {
        return <QRScanner onScan={handleScan} processing={processing} />
    } else if (cameraPermission === 'prompt') {
        return (
            <PermissionContainer>
                <PermissionInner>
                    <PermissionIconContainer>
                        <Icon icon={ScanIcon} size="md" />
                    </PermissionIconContainer>
                    <PermissionTextContainer>
                        <Text variant="h2" weight="medium">
                            {t('feature.permissions.allow-camera-title')}:
                        </Text>
                        <Text weight="medium">
                            {t('feature.permissions.allow-camera-description')}
                        </Text>
                    </PermissionTextContainer>
                    <Button
                        variant="secondary"
                        onClick={handleRequestCameraPermission}>
                        {t('phrases.allow-camera-access')}
                    </Button>
                </PermissionInner>
            </PermissionContainer>
        )
    } else if (cameraPermission === 'denied') {
        return (
            <PermissionContainer>
                <PermissionInner>
                    <PermissionIconContainer>
                        <Icon icon={ScanSadIcon} size="md" />
                    </PermissionIconContainer>
                    <Text weight="medium">
                        {t('feature.omni.camera-permission-denied')}
                    </Text>
                </PermissionInner>
            </PermissionContainer>
        )
    }

    return <HoloLoader />
}

const PermissionContainer = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    padding: 16,
    width: '100%',
    nightGradient: true,
    color: theme.colors.white,
})

const PermissionInner = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    gap: 12,
})

const PermissionIconContainer = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    height: 72,
    borderRadius: '100%',
    backgroundColor: theme.colors.white,
    holoGradient: '400',
    color: theme.colors.night,
})

const PermissionTextContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    gap: 4,
    paddingBottom: 8,
})
