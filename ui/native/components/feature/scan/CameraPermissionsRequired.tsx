import React, { useEffect, useState } from 'react'
import { Camera } from 'react-native-vision-camera'

import { makeLog } from '@fedi/common/utils/log'

import RequestCameraAccess, {
    RequestCameraAccessProps,
} from './RequestCameraAccess'

const log = makeLog('CameraPermissionsRequired')

interface Props extends RequestCameraAccessProps {
    children: React.ReactNode
    onPermissionGranted?: () => void | null
}

const CameraPermissionsRequired: React.FC<Props> = ({
    alternativeActionButton,
    message,
    onPermissionGranted,
    requireMicrophone = false,
    children,
}: Props) => {
    const [permissionGranted, setPermissionGranted] = useState<boolean>(false)

    // first check if user has granted camera permissions
    useEffect(() => {
        const checkForPermissions = async () => {
            const cameraStatus = await Camera.getCameraPermissionStatus()
            const microphoneStatus =
                await Camera.getMicrophonePermissionStatus()
            log.info('cameraStatus:', cameraStatus)
            log.info('microphoneStatus:', microphoneStatus)

            if (cameraStatus === 'authorized') {
                if (
                    (requireMicrophone === true &&
                        cameraStatus === 'authorized' &&
                        microphoneStatus === 'authorized') ||
                    (requireMicrophone === false &&
                        cameraStatus === 'authorized')
                ) {
                    setPermissionGranted(true)
                }
            }
        }

        checkForPermissions()
    }, [requireMicrophone])

    if (permissionGranted === false)
        return (
            <RequestCameraAccess
                alternativeActionButton={alternativeActionButton}
                message={message}
                requireMicrophone={requireMicrophone}
                onAccessGranted={() => {
                    setPermissionGranted(true)
                    onPermissionGranted && onPermissionGranted()
                }}
            />
        )

    return <>{children}</>
}

export default CameraPermissionsRequired
