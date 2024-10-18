import { URDecoder } from '@ngraveio/bc-ur'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import {
    State as FrameState,
    areFramesComplete,
    framesToData,
    parseFramesReducer,
    progressOfFrames,
} from 'qrloop'
import React, { useRef, useState } from 'react'
import { StyleSheet, Vibration, View } from 'react-native'
import { Camera, CameraType } from 'react-native-camera-kit'

import { useUpdatingRef } from '@fedi/common/hooks/util'
import { getBufferEncoding } from '@fedi/common/utils/istextorbinary'

type Props = {
    processing?: boolean
    onQrCodeDetected(data: string): void
}

/**
 * `react-native-camera-kit` declares this type locally and does not export it
 * See https://github.com/teslamotors/react-native-camera-kit/blob/master/src/Camera.d.ts
 */
type OnReadCodeData = {
    nativeEvent: {
        codeStringValue: string
    }
}

const QrCodeScanner: React.FC<Props> = ({ processing, onQrCodeDetected }) => {
    const { theme } = useTheme()
    const [frames, setFrames] = useState<FrameState | null>(null)
    const [urFrames, setUrFrames] = useState<string[] | null>(null)
    const [progress, setProgress] = useState(0)
    const isFocused = useIsFocused()
    const cameraRef = useRef<Camera>(null)
    const previousDataRef = useRef<string | null>(null)
    const previousDataTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
    const framesRef = useUpdatingRef(frames)
    const urFramesRef = useUpdatingRef(urFrames)
    const decoder = useRef<URDecoder>()

    useFocusEffect(() => {
        if (previousDataRef.current) previousDataRef.current = null
        if (decoder.current) return
        decoder.current = new URDecoder()
    })

    const handleDetected = (data: string) => {
        // Only call the detection function if QR data is different
        // but reset after a few seconds... in case some error occurs
        // and we should retry the same input
        if (data === previousDataRef.current) return

        onQrCodeDetected(data)
        Vibration.vibrate(100)

        previousDataRef.current = data
        clearTimeout(previousDataTimeoutRef.current)
        previousDataTimeoutRef.current = setTimeout(() => {
            previousDataRef.current = null
        }, 5000)
    }

    // Fedi loop'd qr codes
    const handleScanLegacy = (data: string) => {
        if (data.startsWith('ur')) return
        const newFrames = parseFramesReducer(framesRef.current, data)
        setFrames(newFrames)
        setProgress(progressOfFrames(newFrames))
        if (areFramesComplete(newFrames)) {
            // Convert the data to a string. If it's binary encoded, convert as base64.
            const frameData = framesToData(newFrames)
            const strData = frameData.toString(
                getBufferEncoding(frameData) === 'binary' ? 'base64' : 'utf8',
            )
            handleDetected(strData)
            // Reset frames & progress after short delay
            setTimeout(() => {
                setFrames(null)
                setProgress(0)
            }, 300)
        }
    }

    // ref: https://github.com/ngraveio/bc-ur
    // For cashu (TODO: encode fedimint notes with UR like cashu)
    const handleScanBcUr = (data: string) => {
        if (!data.startsWith('ur')) return
        // Create the decoder object
        if (!decoder.current) {
            return
        }
        // Don't try to receive the same part twice
        if (urFramesRef.current?.includes(data)) return
        setUrFrames([...(urFramesRef.current ?? []), data])
        decoder.current.receivePart(data)
        const newProgress = decoder.current.estimatedPercentComplete()
        setProgress(newProgress)
        if (decoder.current.isComplete() && decoder.current.isSuccess()) {
            // Get the UR representation of the message
            const ur = decoder.current.resultUR()
            // Decode the CBOR message to a Buffer
            const decoded = ur.decodeCBOR()
            // get the original message, assuming it was a JSON object
            const originalMessage = decoded.toString()
            handleDetected(originalMessage)
            setTimeout(() => {
                setProgress(0)
                setUrFrames(null)
                decoder.current = new URDecoder()
            }, 300)
        } else if (decoder.current.isComplete()) {
            setProgress(0)
            setUrFrames(null)
            decoder.current = new URDecoder()
            // If the decoder is complete, but not successful, log the error
            throw new Error('Decoder error')
        }
    }

    const handleScan = (data: string) => {
        // Ignore scans while processing
        if (processing) return

        try {
            handleScanBcUr(data)
        } catch (err) {
            setProgress(0)
            setUrFrames(null)
        }

        // Attempt to parse qrloop'd QR codes first
        try {
            handleScanLegacy(data)
        } catch (err) {
            // Fall back to regular ol' QR code
            handleDetected(data)
            setFrames(null)
            setProgress(0)
        }
    }

    const style = styles(theme)
    return (
        <View style={style.container}>
            {isFocused && (
                <Camera
                    style={style.camera}
                    ref={cameraRef}
                    cameraType={CameraType.Back}
                    flashMode="auto"
                    scanBarcode={true}
                    onReadCode={(event: OnReadCodeData) =>
                        handleScan(event.nativeEvent.codeStringValue)
                    }
                />
            )}
            {processing && <View style={style.processingCover} />}
            {Boolean(progress) && (
                <View style={style.progressContainer}>
                    <View
                        style={[
                            style.progressBar,
                            { width: `${progress * 100}%` },
                        ]}
                    />
                    <Text tiny style={style.progressText}>
                        {Math.round(progress * 100)}%
                    </Text>
                </View>
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'relative',
            height: '100%',
            width: '100%',
        },
        camera: {
            height: '100%',
            width: '100%',
        },
        processingCover: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
        },
        progressContainer: {
            position: 'absolute',
            bottom: theme.spacing.xl,
            left: theme.spacing.xl,
            right: theme.spacing.xl,
            height: 16,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
            borderRadius: 8,
        },
        progressBar: {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            height: '100%',
            backgroundColor: theme.colors.primary,
        },
        progressText: {
            top: 0,
            left: 0,
            lineHeight: 16,
            width: '100%',
            textAlign: 'center',
            color: theme.colors.secondary,
        },
    })

export default QrCodeScanner
