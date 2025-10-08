import { URDecoder } from '@ngraveio/bc-ur'
import type QrScanner from 'qr-scanner'
import {
    State as FrameState,
    areFramesComplete,
    framesToData,
    parseFramesReducer,
    progressOfFrames,
} from 'qrloop'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { getBufferEncoding } from '@fedi/common/utils/istextorbinary'

import { styled, theme } from '../styles'
import { CircularLoader } from './CircularLoader'
import { HoloLoader } from './HoloLoader'
import { Icon } from './Icon'
import { Text } from './Text'

export type ScanResult = QrScanner.ScanResult

interface Props {
    processing?: boolean
    onScan(result: ScanResult): void
}

export const QRScanner: React.FC<Props> = ({ processing, onScan }) => {
    const { t } = useTranslation()
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
    const qrScannerRef = useRef<QrScanner | null>(null)
    const [mediaError, setMediaError] = useState<string>()
    const [frames, setFrames] = useState<FrameState | null>(null)
    const [urFrames, setUrFrames] = useState<string[] | null>(null)
    const [progress, setProgress] = useState(0)
    const [isLoading, setIsLoading] = useState(true)

    // Maintain a ref to onScan and frames to avoid re-running useEffects
    const framesRef = useUpdatingRef(frames)
    const onScanRef = useUpdatingRef(onScan)
    const urFramesRef = useUpdatingRef(urFrames)
    const decoder = useRef<URDecoder>()

    useEffect(() => {
        if (decoder.current) return
        decoder.current = new URDecoder()
    }, [])

    const handleDetected = useCallback(
        (strData: string, result: ScanResult) => {
            onScanRef.current({
                data: strData,
                cornerPoints: result.cornerPoints,
            })
        },
        [onScanRef],
    )

    // Fedi loop'd qr codes
    const handleScanLegacy = useCallback(
        (result: ScanResult) => {
            if (result.data.startsWith('ur')) return
            const newFrames = parseFramesReducer(framesRef.current, result.data)
            if (areFramesComplete(newFrames)) {
                // Convert the data to a string. If it's binary encoded, convert as base64.
                const frameData = framesToData(newFrames)
                const strData = frameData.toString(
                    getBufferEncoding(frameData) === 'binary'
                        ? 'base64'
                        : 'utf8',
                )
                handleDetected(strData, result)
            }
            setFrames(newFrames)
            setProgress(progressOfFrames(newFrames))
        },
        [framesRef, handleDetected],
    )

    // ref: https://github.com/ngraveio/bc-ur
    // For cashu (TODO: encode fedimint notes with UR like cashu)
    const handleScanBcUr = useCallback(
        (result: ScanResult) => {
            // console.warn('urDATA', result.data, result.data.startsWith('ur'))
            if (!result.data.startsWith('ur')) return
            // Create the decoder object
            if (!decoder.current) {
                return
            }
            // Don't try to receive the same part twice
            if (urFramesRef.current?.includes(result.data)) return
            setUrFrames([...(urFramesRef.current ?? []), result.data])
            // console.warn('res', decoder.current.receivedPartIndexes())
            decoder.current.receivePart(result.data)
            const newProgress = decoder.current.estimatedPercentComplete()
            setProgress(newProgress)
            if (decoder.current.isComplete() && decoder.current.isSuccess()) {
                // Get the UR representation of the message
                const ur = decoder.current.resultUR()
                // Decode the CBOR message to a Buffer
                const decoded = ur.decodeCBOR()
                // get the original message, assuming it was a JSON object
                const originalMessage = decoded.toString()
                handleDetected(originalMessage, result)
                setTimeout(() => {
                    setProgress(0)
                    decoder.current = new URDecoder()
                }, 300)
            } else if (decoder.current.isComplete()) {
                setProgress(0)
                decoder.current = new URDecoder()
                // If the decoder is complete, but not successful, log the error
                throw new Error('Decoder error')
            }
        },
        [handleDetected, urFramesRef],
    )

    const handleScan = useCallback(
        (result: ScanResult) => {
            // Attempt to parse cashu encoded qr
            try {
                handleScanBcUr(result)
            } catch (e) {
                setProgress(0)
            }
            // Attempt to parse qrloop'd QR codes first
            try {
                handleScanLegacy(result)
            } catch (err) {
                // Fall back to regular ol' QR code
                onScanRef.current(result)
            }
        },
        [handleScanBcUr, handleScanLegacy, onScanRef],
    )

    // Sets up QrScanner using device camera
    const handleScannerSetup = useCallback(async () => {
        if (!decoder.current) decoder.current = new URDecoder()
        if (!videoEl) return
        try {
            // Listen for when we start playing to hide loader
            const onPlaying = () => {
                setIsLoading(false)
                videoEl.removeEventListener('playing', onPlaying)
            }
            videoEl.addEventListener('playing', onPlaying)

            // Start scanner and play in video element
            const QrScanner = (await import('qr-scanner')).default
            const qrScanner = new QrScanner(
                videoEl,
                result => handleScan(result),
                {
                    returnDetailedScanResult: true,
                    onDecodeError: () => null, // no-op
                },
            )
            await qrScanner.start()
            qrScannerRef.current = qrScanner
        } catch (err) {
            setMediaError(formatErrorMessage(t, err, 'errors.unknown-error'))
        }
    }, [videoEl, handleScan, t])

    // Setup scanner on mount, tear down on unmount
    useEffect(() => {
        handleScannerSetup()
        return () => {
            const qrScanner = qrScannerRef.current
            if (qrScanner) {
                qrScanner.destroy()
                qrScannerRef.current = null
                decoder.current = undefined
            }
        }
    }, [handleScannerSetup])

    return (
        <Container>
            <Video ref={setVideoEl} />
            {isLoading && (
                <Loading>
                    <HoloLoader size="xl" />
                </Loading>
            )}
            {processing && (
                <Loading shaded>
                    <CircularLoader />
                </Loading>
            )}
            {progress !== 0 && (
                <Progress>
                    <ProgressBar style={{ width: `${progress * 100}%` }} />
                    <ProgressPercent>
                        {Math.round(progress * 100)}%
                    </ProgressPercent>
                </Progress>
            )}
            {mediaError && (
                <ErrorComponent>
                    <Icon icon={ErrorIcon} />
                    <Text variant="caption">{mediaError}</Text>
                </ErrorComponent>
            )}
        </Container>
    )
}

const padding = 4
const Container = styled('div', {
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
    padding,
    fediGradient: 'sky-heavy',
    borderRadius: 20,

    '@sm': {
        flex: 1,
        aspectRatio: 'none',
    },
})

const Video = styled('video', {
    position: 'absolute',
    inset: padding,
    width: `calc(100% - ${padding * 2}px)`,
    height: `calc(100% - ${padding * 2}px)`,
    borderRadius: 16,
    background: theme.colors.white,
    objectFit: 'cover',
})

const Loading = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    inset: padding,
    borderRadius: 16,

    variants: {
        shaded: {
            true: {
                background: 'rgba(0, 0, 0, 0.4)',
                color: theme.colors.white,
            },
        },
    },
})

const Progress = styled('div', {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    height: 12,
    borderRadius: 6,
    background: theme.colors.primary20,
    overflow: 'hidden',
})

const ProgressBar = styled('div', {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    background: theme.colors.primary,
    borderRadius: 6,
})

const ProgressPercent = styled('div', {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: theme.fontSizes.tiny,
    color: theme.colors.white,
    textShadow: `0 1px 1px ${theme.colors.primary}`,
})

const ErrorComponent = styled('div', {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 8,
    color: theme.colors.darkGrey,
})
