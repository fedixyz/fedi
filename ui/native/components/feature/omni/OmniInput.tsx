import Clipboard from '@react-native-clipboard/clipboard'
import { Theme, useTheme } from '@rneui/themed'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { selectActiveFederationId } from '@fedi/common/redux'
import { parseUserInput } from '@fedi/common/utils/parser'

import { fedimint } from '../../../bridge'
import { useAppSelector } from '../../../state/hooks'
import {
    AnyParsedData,
    ParsedUnknownData,
    ParserDataType,
} from '../../../types'
import { SvgImageName } from '../../ui/SvgImage'
import { OmniConfirmation } from './OmniConfirmation'
import { OmniMemberSearch } from './OmniMemberSearch'
import { OmniQrScanner } from './OmniQrScanner'

export interface OmniInputAction {
    label: React.ReactNode
    icon: SvgImageName
    onPress: () => void | Promise<void>
}

interface Props<T extends ParserDataType, ExpectedData> {
    /** List of input types your component will handle. Any others will be handled internally. */
    expectedInputTypes: readonly T[]
    /** Callback for when an expected input is entered. Only types from `expectedInputTypes` will be sent. */
    onExpectedInput(data: ExpectedData): void
    /** Callback for when an unexpected input is successfully handled in-place, e.g. LNURL auth or ecash token redeem. */
    onUnexpectedSuccess(data: AnyParsedData): void
    /** Custom actions to add in addition to default ones */
    customActions?: OmniInputAction[]
    /** Custom label for the "Paste" action */
    pasteLabel?: string
}

export function OmniInput<
    T extends ParserDataType,
    ExpectedData = Extract<AnyParsedData, { type: T }>,
>(props: Props<T, ExpectedData>): React.ReactElement {
    const propsRef = useUpdatingRef(props)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const toast = useToast()
    const [inputMethod, setInputMethod] = useState<'scan' | 'search'>('scan')
    const [isParsing, setIsParsing] = useState(false)
    const [unexpectedData, setUnexpectedData] = useState<AnyParsedData>()
    const [invalidData, setInvalidData] = useState<ParsedUnknownData>()
    const isParsingRef = useUpdatingRef(isParsing)

    const {
        expectedInputTypes,
        customActions,
        onUnexpectedSuccess,
        pasteLabel,
    } = props
    const canLnurlPay = expectedInputTypes.includes(
        ParserDataType.LnurlPay as T,
    )
    const canLnurlWithdraw = expectedInputTypes.includes(
        ParserDataType.LnurlWithdraw as T,
    )
    const canMemberSearch = expectedInputTypes.includes(
        ParserDataType.FediChatUser as T,
    )

    // TODO: Implement Room search for matrix (knocking)
    // const canRoomSearch = expectedInputTypes.includes(
    //     ParserDataType.FediChatRoom as T,
    // )

    const parseInput = useCallback(
        async (input: string) => {
            if (!input || isParsingRef.current) return
            setIsParsing(true)
            const parsedData = await parseUserInput(
                input,
                fedimint,
                t,
                activeFederationId,
            )
            setIsParsing(false)

            const expectedTypes = propsRef.current
                .expectedInputTypes as readonly string[]

            if (expectedTypes.includes(parsedData.type)) {
                propsRef.current.onExpectedInput(parsedData as ExpectedData)
            } else if (parsedData.type === ParserDataType.Unknown) {
                setInvalidData(parsedData)
            } else {
                setUnexpectedData(parsedData)
            }
        },
        [propsRef, isParsingRef, t, activeFederationId],
    )

    const handlePaste = useCallback(async () => {
        try {
            const input = await Clipboard.getString()
            await parseInput(input)
        } catch (err) {
            toast.error(t, err)
        }
    }, [parseInput, toast, t])

    const actions: OmniInputAction[] = useMemo(() => {
        const contextualActions: OmniInputAction[] = []
        if (inputMethod !== 'search' && canMemberSearch) {
            contextualActions.push({
                label: t(
                    canLnurlPay
                        ? 'feature.omni.action-enter-username-or-ln'
                        : 'feature.omni.action-enter-username',
                ),
                icon: 'Keyboard',
                onPress: () => setInputMethod('search'),
            })
        }
        if (inputMethod !== 'scan') {
            contextualActions.push({
                label: t('feature.omni.action-scan'),
                icon: 'Scan',
                onPress: () => setInputMethod('scan'),
            })
        }

        return [
            ...contextualActions,
            {
                label: pasteLabel || t('feature.omni.action-paste'),
                icon: 'Clipboard',
                onPress: handlePaste,
            },
            ...(customActions || []),
        ]
    }, [
        customActions,
        inputMethod,
        canMemberSearch,
        canLnurlPay,
        pasteLabel,
        handlePaste,
        t,
    ])

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

    const style = styles(theme)
    return (
        <View style={style.container}>
            {inputMethod === 'scan' && (
                <OmniQrScanner
                    onInput={parseInput}
                    actions={actions}
                    isProcessing={Boolean(isParsing || unexpectedData)}
                />
            )}
            {inputMethod === 'search' && (
                <OmniMemberSearch
                    onInput={parseInput}
                    actions={actions}
                    canLnurlPay={canLnurlPay}
                    canLnurlWithdraw={canLnurlWithdraw}
                />
            )}
            {confirmation}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
            flexDirection: 'column',
            gap: theme.spacing.lg,
        },
    })
