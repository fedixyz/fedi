import { styled } from '@stitches/react'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ClipboardIcon from '@fedi/common/assets/svgs/clipboard.svg'
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
import { HorizontalLine } from '../HorizontalLine'
import { OmniConfirmation } from './OmniConfirmation'
import { OmniQrScanner } from './OmniQrScanner'

interface OmniCustomActionObject {
    label: React.ReactNode
    icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>
    onClick(): void
}

export type OmniCustomAction = OmniCustomActionObject | 'paste'

interface Props<T extends ParserDataType, ExpectedData> {
    children?: (props: { onSubmit: (value: string) => void }) => React.ReactNode
    /** List of input types your component will handle. Any others will be handled internally. */
    expectedInputTypes: readonly T[]
    /** Callback for when an expected input is entered. Only types from `expectedInputTypes` will be sent. */
    onExpectedInput(data: ExpectedData): void
    /** Callback for when an unexpected input is successfully handled in-place, e.g. LNURL auth or ecash token redeem. */
    onUnexpectedSuccess(data: AnyParsedData): void
    hideScanner?: boolean
    customActions?: OmniCustomAction[]
    loading?: boolean
}

export function OmniInput<
    T extends ParserDataType,
    ExpectedData = Extract<AnyParsedData, { type: T }>,
>(props: Props<T, ExpectedData>): React.ReactElement {
    const {
        customActions = [],
        hideScanner = false,
        onUnexpectedSuccess,
    } = props

    const propsRef = useUpdatingRef(props)
    const { t } = useTranslation()
    const toast = useToast()

    const federationId = useAppSelector(selectActiveFederationId)
    const [isParsing, setIsParsing] = useState(false)
    const [unexpectedData, setUnexpectedData] = useState<AnyParsedData>()
    const emptyString = ''
    const [omniError, setOmniError] = useState(emptyString)

    const [invalidData, setInvalidData] = useState<
        ParsedUnknownData | ParsedOfflineError
    >()

    const isLoading = props.loading || isParsing
    const isLoadingRef = useUpdatingRef(isLoading)

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
    }, [omniError, t])

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
                {!hideScanner && (
                    <OmniQrScanner onScan={parseInput} processing={isLoading} />
                )}
            </Main>

            {typeof props.children === 'function'
                ? props.children({ onSubmit: parseInput })
                : null}

            <Actions>
                {customActions.length > 0 && (
                    <HorizontalLine text={t('words.or')} />
                )}

                {customActions?.map((action, idx) => {
                    if (typeof action === 'string') {
                        return (
                            <Button
                                key={idx}
                                onClick={handlePaste}
                                disabled={isLoading}
                                variant="secondary"
                                icon={ClipboardIcon}>
                                {t('feature.omni.action-paste')}
                            </Button>
                        )
                    }

                    const { label, icon, onClick } = action

                    return (
                        <Button
                            key={idx}
                            onClick={onClick}
                            disabled={isLoading}
                            variant="secondary"
                            icon={icon}>
                            {label}
                        </Button>
                    )
                })}
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
    gap: 10,
})

const Main = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    textAlign: 'center',
})

const Actions = styled('div', {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
})
