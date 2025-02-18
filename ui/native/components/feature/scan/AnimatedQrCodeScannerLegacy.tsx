import {
    BARCODE_FORMATS,
    Barcode,
    BarcodeType,
    isAndroidBarcode,
    isIOSBarcode,
    useBarcodeScanner,
} from '@mgcrea/vision-camera-barcode-scanner'
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

import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('AnimatedQrCodeScannerLegacy')

type QrCodeScannerProps = {
    device: CameraDevice
    onQrCodeDetected: (data: string) => void
    onProgress: (progress: number) => void
}

const QrCodeScanner = ({
    device,
    onQrCodeDetected,
    onProgress,
}: QrCodeScannerProps) => {
    const [sendingResult, setSendingResult] = useState(false)
    const [frames, setFrames] = useState<FrameState | null>(null)

    const { props: frameProcessorProps } = useBarcodeScanner({
        barcodeTypes: [BARCODE_FORMATS.QR_CODE as unknown as BarcodeType],
        onBarcodeScanned: barcodes => {
            barcodes.forEach((barcode: Barcode) => {
                let data: string | undefined

                if (isAndroidBarcode(barcode.native)) {
                    // Extract data only if it's a string
                    const contentData = barcode.native.content?.data
                    if (typeof contentData === 'string') {
                        data = contentData
                    }
                } else if (isIOSBarcode(barcode.native)) {
                    // Access iOS-specific barcode payload
                    data = barcode.native.payload
                }

                if (!data) return

                const updatedFrames = parseFramesReducer(frames, data)

                // Report progress
                const updatedProgress = progressOfFrames(updatedFrames)
                onProgress(updatedProgress)

                if (progressOfFrames(frames) !== updatedProgress) {
                    setFrames(updatedFrames)
                    if (areFramesComplete(updatedFrames) && !sendingResult) {
                        setSendingResult(true)
                        setTimeout(() => {
                            onQrCodeDetected(
                                framesToData(updatedFrames).toString(),
                            )

                            // Reset frames once a QR code is detected
                            setFrames(null)
                            setSendingResult(false)
                        }, 50)
                    } else {
                        log.info('Progress:', updatedProgress)
                    }
                }
            })
        },
        scanMode: 'once',
    })

    useEffect(() => {
        setFrames(frames)
    }, [frames, onProgress, onQrCodeDetected, sendingResult])

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
