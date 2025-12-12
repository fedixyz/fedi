import { useIsFocused } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import {
    areFramesComplete,
    State as FrameState,
    framesToData,
    parseFramesReducer,
    progressOfFrames,
} from 'qrloop'
import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Vibration, View } from 'react-native'
import {
    Camera,
    useCameraDevice,
    useCodeScanner,
} from 'react-native-vision-camera'

import { useUpdatingRef } from '@fedi/common/hooks/util'
import { getBufferEncoding } from '@fedi/common/utils/istextorbinary'

import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type QrCodeScanner = {
    onQrCodeDetected: (data: string) => void
    processing?: boolean
}

const QrCodeScanner = ({ processing, onQrCodeDetected }: QrCodeScanner) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const previousDataRef = useRef<string | null>(null)
    const previousDataTimeoutRef = useRef<
        ReturnType<typeof setTimeout> | undefined
    >(undefined)
    const [progress, setProgress] = useState(0)
    const [frames, setFrames] = useState<FrameState | null>(null)
    const isFocused = useIsFocused()
    const framesRef = useUpdatingRef(frames)
    const device = useCameraDevice('back')
    const cameraRef = useRef<Camera>(null)
    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned: (codes, _) => {
            codes.map(c => handleScan(c.value as string))
        },
    })
    const handleDetected = useCallback(
        (data: string) => {
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
        },
        [onQrCodeDetected],
    )

    const handleScan = useCallback(
        (data: string) => {
            // Ignore scans while processing
            if (processing) return

            // Attempt to parse qrloop'd QR codes first
            try {
                const newFrames = parseFramesReducer(framesRef.current, data)
                setFrames(newFrames)
                setProgress(progressOfFrames(newFrames))
                if (areFramesComplete(newFrames)) {
                    // Convert the data to a string. If it's binary encoded, convert as base64.
                    const frameData = framesToData(newFrames)
                    const strData = frameData.toString(
                        getBufferEncoding(frameData) === 'binary'
                            ? 'base64'
                            : 'utf8',
                    )
                    handleDetected(strData)
                    // Reset frames & progress after short delay
                    setTimeout(() => {
                        setFrames(null)
                        setProgress(0)
                    }, 300)
                }
            } catch (err) {
                // Fall back to regular ol' QR code
                handleDetected(data)
                setFrames(null)
                setProgress(0)
            }
        },
        [framesRef, handleDetected, processing],
    )

    const style = styles(theme)
    if (!device)
        return (
            <Flex center style={style.center}>
                <SvgImage name="ScanSad" size={SvgImageSize.xl} />
                <Text medium>{t('errors.camera-unavailable')}</Text>
            </Flex>
        )

    return (
        <View style={style.container}>
            {isFocused && (
                <Camera
                    style={style.camera}
                    ref={cameraRef}
                    device={device}
                    isActive={true}
                    codeScanner={codeScanner}
                />
            )}
            {processing && <Flex center style={style.processingCover} />}
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
        center: {
            width: '100%',
            height: '100%',
        },
    })

export default QrCodeScanner
