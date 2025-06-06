import { styled } from '@stitches/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ClipboardIcon from '@fedi/common/assets/svgs/clipboard.svg'
import KeyboardIcon from '@fedi/common/assets/svgs/keyboard.svg'
import QRIcon from '@fedi/common/assets/svgs/qr.svg'
import ScanIcon from '@fedi/common/assets/svgs/scan.svg'
import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    selectActiveFederationId,
    selectIsInternetUnreachable,
} from '@fedi/common/redux'
import {
    AnyParsedData,
    ParsedOfflineError,
    ParsedUnknownData,
    ParserDataType,
} from '@fedi/common/types'
import { parseUserInput } from '@fedi/common/utils/parser'

import { useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { Input } from '../Input'
import { Text } from '../Text'
import { OmniConfirmation } from './OmniConfirmation'
import { OmniQrScanner } from './OmniQrScanner'

interface OmniInputAction {
    label: React.ReactNode
    icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>
    onClick(): void
}

interface Props<T extends ParserDataType, ExpectedData> {
    /** List of input types your component will handle. Any others will be handled internally. */
    expectedInputTypes: readonly T[]
    /** Callback for when an expected input is entered. Only types from `expectedInputTypes` will be sent. */
    onExpectedInput(data: ExpectedData): void
    /** Callback for when an unexpected input is successfully handled in-place, e.g. LNURL auth or ecash token redeem. */
    onUnexpectedSuccess(data: AnyParsedData): void
    inputLabel?: React.ReactNode
    inputPlaceholder?: string
    pasteLabel?: string
    customActions?: OmniInputAction[]
    defaultToScan?: boolean
    loading?: boolean
    children?: (props: { onSubmit: (value: string) => void }) => React.ReactNode
    value?: string
    onValueChange?: (value: string) => void
    hideConfirmButton?: boolean
}

export function OmniInput<
    T extends ParserDataType,
    ExpectedData = Extract<AnyParsedData, { type: T }>,
>(props: Props<T, ExpectedData>): React.ReactElement {
    const propsRef = useUpdatingRef(props)
    const { t } = useTranslation()
    const toast = useToast()
    const federationId = useAppSelector(selectActiveFederationId)
    const [isScanning, setIsScanning] = useState(props.defaultToScan || false)
    const [isParsing, setIsParsing] = useState(false)
    const [unexpectedData, setUnexpectedData] = useState<AnyParsedData>()
    const emptyString = ''
    const [omniError, setOmniError] = useState(emptyString)

    const [invalidData, setInvalidData] = useState<
        ParsedUnknownData | ParsedOfflineError
    >()
    const [value, setValue] = useState(props.value || '')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const isLoading = props.loading || isParsing
    const isLoadingRef = useUpdatingRef(isLoading)

    const { customActions, inputPlaceholder, onUnexpectedSuccess } = props
    const inputLabel = props.inputLabel || 'Input data'
    const pasteLabel = props.pasteLabel || t('feature.omni.action-paste')

    const isInternetUnreachable = useAppSelector(selectIsInternetUnreachable)

    useEffect(() => {
        if (omniError !== emptyString) {
            const errorData: ParsedOfflineError = {
                type: ParserDataType.OfflineError,
                data: {
                    title: t('feature.omni.error-network-title'),
                    message: t('feature.omni.error-network-message'),
                    goBackText: 'Retry',
                },
            }
            setInvalidData(errorData)
            setOmniError(emptyString)
        }
    }, [omniError, invalidData, unexpectedData, t])

    const parseInput = useCallback(
        async (input: string) => {
            if (isLoadingRef.current) return
            if (!input)
                return setInvalidData({
                    type: ParserDataType.Unknown,
                    data: { message: t('feature.omni.unsupported-unknown') },
                })
            setIsParsing(true)
            try {
                const parsedData = await parseUserInput(
                    input,
                    fedimint,
                    t,
                    federationId,
                    isInternetUnreachable,
                )

                const expectedTypes = propsRef.current
                    .expectedInputTypes as readonly string[]

                if (expectedTypes.includes(parsedData.type)) {
                    propsRef.current.onExpectedInput(parsedData as ExpectedData)
                } else if (parsedData.type === ParserDataType.Unknown) {
                    setInvalidData(parsedData)
                } else if (parsedData.type === ParserDataType.OfflineError) {
                    setOmniError(parsedData.data.message)
                } else {
                    setUnexpectedData(parsedData)
                }
            } catch (err) {
                setOmniError(t('feature.omni.error-network-message'))
            } finally {
                setIsParsing(false)
            }
        },
        [propsRef, isLoadingRef, t, federationId, isInternetUnreachable],
    )

    const handlePaste = useCallback(async () => {
        try {
            let input: string | null = null

            if (
                'readText' in navigator.clipboard &&
                typeof navigator.clipboard.readText === 'function'
            ) {
                try {
                    // Newer versions of firefox allow you to paste with a confirmation similar to how iOS does it
                    // When cancelled, it throws an error
                    input = await navigator.clipboard.readText()
                } catch {
                    /*no-op*/
                }
            } else {
                input = prompt(t('feature.omni.action-paste'))
            }

            await parseInput(input ?? '')
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }, [parseInput, toast, t])

    // Perform a QrScanner scan from an image file, rather than from the QRScanner component
    const handleImageFile = useCallback(
        async (ev: React.ChangeEvent<HTMLInputElement>) => {
            const image = ev.currentTarget.files?.[0]
            if (!image) return
            ev.currentTarget.value = ''
            try {
                const QrScanner = (await import('qr-scanner')).default
                const result = await QrScanner.scanImage(image, {
                    returnDetailedScanResult: true,
                })
                parseInput(result.data)
            } catch (err) {
                toast.error(t, err, 'errors.unknown-error')
            }
            // Reset the input so they can re-select the same file if they wish
        },
        [toast, parseInput, t],
    )

    const actions = useMemo(() => {
        return [
            isScanning
                ? {
                      label: inputLabel,
                      icon: KeyboardIcon,
                      onClick: () => setIsScanning(false),
                  }
                : {
                      label: t('feature.omni.action-scan'),
                      icon: ScanIcon,
                      onClick: () => setIsScanning(true),
                  },
            {
                label: pasteLabel,
                icon: ClipboardIcon,
                onClick: handlePaste,
            },
            {
                label: t('feature.omni.action-upload'),
                icon: QRIcon,
                onClick: () => fileInputRef.current?.click(),
            },
            ...(customActions || []),
        ]
    }, [
        customActions,
        isScanning,
        inputLabel,
        pasteLabel,
        handlePaste,
        fileInputRef,
        t,
    ])

    const inputOnChange = (val: string) => {
        setValue(val)
        if (typeof props.onValueChange === 'function') {
            props.onValueChange(val)
        }
    }
    const inputValue = props.value || value

    let confirmation: React.ReactNode | undefined
    if (invalidData || unexpectedData) {
        confirmation = (
            <OmniConfirmation
                parsedData={(invalidData || unexpectedData) as AnyParsedData}
                onGoBack={() => {
                    setInvalidData(undefined)
                    setUnexpectedData(undefined)
                }}
                onSuccess={onUnexpectedSuccess}
            />
        )
    }

    return (
        <Container>
            <Main>
                {isScanning ? (
                    <OmniQrScanner onScan={parseInput} processing={isLoading} />
                ) : (
                    <InputForm
                        onSubmit={e => {
                            e.preventDefault()
                            parseInput(value)
                        }}>
                        <Input
                            label={inputLabel}
                            value={inputValue}
                            placeholder={inputPlaceholder}
                            onChange={ev =>
                                inputOnChange(ev.currentTarget.value)
                            }
                            onKeyDown={ev => {
                                if (ev.key === 'Enter') {
                                    ev.preventDefault()
                                }
                            }}
                            disabled={isLoading}
                            autoFocus
                        />
                        {props.hideConfirmButton ? null : (
                            <Button
                                width="full"
                                type="submit"
                                disabled={!inputValue}
                                loading={isLoading}>
                                {t('words.confirm')}
                            </Button>
                        )}
                    </InputForm>
                )}
            </Main>
            {typeof props.children === 'function'
                ? props.children({ onSubmit: parseInput })
                : null}
            <Actions>
                {actions.map(({ label, icon, onClick }, idx) => (
                    <Action key={idx} onClick={onClick} disabled={isLoading}>
                        <Icon size="sm" icon={icon} />
                        <Text weight="bold">{label}</Text>
                    </Action>
                ))}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFile}
                    style={{ display: 'none' }}
                />
            </Actions>
            {confirmation}
        </Container>
    )
}

const Container = styled('div', {
    position: 'relative',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
})

const Main = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
})

const Actions = styled('div', {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
})

const Action = styled('button', {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    height: 40,
    padding: '0 8px',
    borderRadius: 8,

    '&:hover': {
        background: 'rgba(0, 0, 0, 0.04)',
    },

    '&:disabled': {
        opacity: 0.5,
        pointerEvents: 'none',
    },
})

const InputForm = styled('form', {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: 8,
})
