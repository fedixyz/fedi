import {
    State as FrameState,
    areFramesComplete,
    framesToData,
    parseFramesReducer,
    progressOfFrames,
} from 'qrloop'
import { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { Camera, CameraDevice } from 'react-native-vision-camera'
import { BarcodeFormat, useScanBarcodes } from 'vision-camera-code-scanner'

import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('AnimatedQrCodeScannerLegacy')

/*
    This is the QR scanner that was used when react-native-vision-camera v2
    was compatible with the latest React Native. After upgrading to RN v0.72,
    this library broke with errors at both compile and runtime when using frame
    processors like useScanBarcodes

    Its dependency on react-native-reanimated made it difficult to refactor
    to work with RN 72 so we had to switch to use react-native-camera-kit
    for scanning QRs

    Leaving this code here so we can switch back to it after theu upgrade to v3
    is complete since it is more robust than react-native-camera-kit but still 
    works well wherever frame processors are not needed so for now we are
    keeping the dependency on v2
*/

type QrCodeScanner = {
    device: CameraDevice
    onQrCodeDetected: (data: string) => void
    onProgress: (progress: number) => void
}

const QrCodeScanner = ({
    device,
    onQrCodeDetected,
    onProgress,
}: QrCodeScanner) => {
    const [sendingResult, setSendingResult] = useState<boolean>(false)
    const [frameProcessor, barcodes] = useScanBarcodes(
        [BarcodeFormat.QR_CODE],
        {
            checkInverted: true,
        },
    )
    const [frames, setFrames] = useState<FrameState | null>(null)

    useEffect(() => {
        barcodes.map(b => {
            const updatedFrames = parseFramesReducer(
                frames,
                b.content?.data as string,
            )

            // Report progress
            const updatedProgress = progressOfFrames(updatedFrames)
            onProgress(updatedProgress)

            // To prevent infinite loops ...
            if (progressOfFrames(frames) !== updatedProgress) {
                setFrames(updatedFrames)
                if (areFramesComplete(updatedFrames) && !sendingResult) {
                    setSendingResult(true)
                    setTimeout(() => {
                        onQrCodeDetected(framesToData(updatedFrames).toString())

                        // reset frames once we've found a hit ...
                        setFrames(null)
                        setSendingResult(false)
                    }, 50)
                } else {
                    log.info('Progress:', progressOfFrames(updatedFrames))
                }
            }
        })
    }, [
        barcodes,
        frames,
        onProgress,
        onQrCodeDetected,
        sendingResult,
        setFrames,
    ])

    return (
        <Camera
            style={styles.camera}
            device={device}
            isActive={true}
            frameProcessor={frameProcessor}
            frameProcessorFps={'auto'}
        />
    )
}

const styles = StyleSheet.create({
    camera: {
        height: '100%',
        width: '100%',
    },
})

export default QrCodeScanner
