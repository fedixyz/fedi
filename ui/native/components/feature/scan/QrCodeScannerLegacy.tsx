import { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { Camera, CameraDevice } from 'react-native-vision-camera'
import { BarcodeFormat, useScanBarcodes } from 'vision-camera-code-scanner'

import { usePrevious } from '../../../state/hooks'

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
}

const QrCodeScanner = ({ device, onQrCodeDetected }: QrCodeScanner) => {
    const [detectedQrData, setDetectedQrData] = useState<string>('')
    const previousQrData = usePrevious(detectedQrData)
    const [frameProcessor, barcodes] = useScanBarcodes(
        [BarcodeFormat.QR_CODE],
        {
            checkInverted: true,
        },
    )

    useEffect(() => {
        if (detectedQrData !== '' && detectedQrData !== previousQrData) {
            // TODO: imeplement a delay to throttle input from the scanner
            // if (throttling) return
            // setThrottling(true)
            // setTimeout(() => {
            //     setThrottling(false)
            //     onQrCodeDetected(b.content?.data)
            // }, millisecondsToThrottle)

            // Only call the detection function if QR data is different
            // but reset after a few seconds... in case some error occurs
            // and we should retry the same input
            onQrCodeDetected(detectedQrData)
            setTimeout(() => setDetectedQrData(''), 5000)
        }
    }, [detectedQrData, onQrCodeDetected, previousQrData])

    useEffect(() => {
        barcodes.map(b => {
            setDetectedQrData(b.content?.data as string)
        })
    }, [barcodes])

    return (
        <Camera
            style={styles.camera}
            device={device}
            isActive={true}
            frameProcessor={frameProcessor}
            frameProcessorFps={2}
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
