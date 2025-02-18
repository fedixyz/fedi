import {
    BARCODE_FORMATS,
    BarcodeType,
    useBarcodeScanner,
} from '@mgcrea/vision-camera-barcode-scanner'
import { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { Camera, CameraDevice } from 'react-native-vision-camera'

import { usePrevious } from '../../../state/hooks'

type QrCodeScannerProps = {
    device: CameraDevice
    onQrCodeDetected: (data: string) => void
}

const QrCodeScanner = ({ device, onQrCodeDetected }: QrCodeScannerProps) => {
    const [detectedQrData, setDetectedQrData] = useState<string>('')
    const previousQrData = usePrevious(detectedQrData)

    // Using useBarcodeScanner with BARCODE_FORMATS.QR_CODE casted as needed
    const { props: frameProcessorProps } = useBarcodeScanner({
        barcodeTypes: [BARCODE_FORMATS.QR_CODE as unknown as BarcodeType],
        onBarcodeScanned: barcodes => {
            const qrData = barcodes[0]?.value
            if (qrData && qrData !== detectedQrData) {
                setDetectedQrData(qrData)
            }
        },
        scanMode: 'once',
    })

    useEffect(() => {
        if (detectedQrData !== '' && detectedQrData !== previousQrData) {
            onQrCodeDetected(detectedQrData)
            setTimeout(() => setDetectedQrData(''), 5000)
        }
    }, [detectedQrData, onQrCodeDetected, previousQrData])

    return (
        <Camera
            style={styles.camera}
            device={device}
            isActive={true}
            {...frameProcessorProps}
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
