import { Text, Theme, useTheme, Button, Input } from '@rneui/themed'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Keyboard,
    Pressable,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import { selectActiveFederationId } from '@fedi/common/redux'
import { hexToRgba } from '@fedi/common/utils/color'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppSelector } from '../../../state/hooks'
import { TransactionListEntry } from '../../../types'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { HistoryDetailItem, HistoryDetailItemProps } from './HistoryDetailItem'

export type HistoryDetailProps = {
    txn: TransactionListEntry
    icon: React.ReactNode
    title: React.ReactNode
    amount: string
    fees?: string
    items: HistoryDetailItemProps[]
    onPressFees?: () => void
    notes?: string
    onSaveNotes?: (notes: string) => void
    onClose: () => void
}

const log = makeLog(
    'native/components/feature/transaction-history/HistoryDetail',
)

export const HistoryDetail: React.FC<HistoryDetailProps> = ({
    icon,
    title,
    amount,
    items,
    fees,
    txn: { id, ...txn },
    onPressFees = () => null,
    notes: propsNotes,
    onSaveNotes,
    onClose,
}) => {
    const inputRef = useRef<TextInput | null>(null)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [notes, setNotes] = useState<string>(propsNotes || '')
    const [isFocused, setIsFocused] = useState(false)
    const [checkLoading, setCheckLoading] = useState(false)
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const toast = useToast()
    const { fetchTransactions } = useTransactionHistory(fedimint)

    // If notes prop changes, update notes state
    useEffect(() => {
        if (propsNotes !== undefined) {
            setNotes(propsNotes)
        }
    }, [propsNotes])

    const handleNotesInputChanged = useCallback(
        (input: string) => {
            setNotes(input)
        },
        [setNotes],
    )

    const handleSaveNotes = useCallback(() => {
        if (onSaveNotes && notes !== propsNotes) {
            onSaveNotes(notes)
        }
    }, [notes, onSaveNotes, propsNotes])

    const handleClose = useCallback(() => {
        handleSaveNotes()
        onClose()
    }, [handleSaveNotes, onClose])

    const handleCheckIncomingFunds = useCallback(async () => {
        if (!activeFederationId) return

        setCheckLoading(true)
        try {
            await fedimint.recheckPeginAddress({
                federationId: activeFederationId,
                operationId: id,
            })
            const transactions = await fetchTransactions()
            const foundTransaction = transactions.find(
                tx =>
                    tx.kind === 'onchainDeposit' &&
                    tx.id === id &&
                    tx.state?.type === 'claimed',
            )

            if (foundTransaction)
                toast.show({
                    status: 'success',
                    content: t('feature.receive.onchain-funds-received'),
                })
            else
                toast.show({
                    status: 'info',
                    content: t('feature.receive.no-incoming-funds-detected'),
                })
        } catch (e) {
            log.error('Failed to check incoming funds', e)
            toast.error(t, e)
        } finally {
            setCheckLoading(false)
        }
    }, [activeFederationId, id, fetchTransactions, t, toast])

    const style = styles(theme)

    // we show uneditable notes if we don't have a save function (like for multispend txns)
    const shouldShowNotesField = onSaveNotes || notes

    return (
        <Pressable style={style.container} onPress={Keyboard.dismiss}>
            <TouchableOpacity
                style={style.closeIconContainer}
                onPress={handleClose}>
                <SvgImage name="Close" size={SvgImageSize.md} />
            </TouchableOpacity>
            {icon}
            <Text style={style.detailTitle}>{title}</Text>
            {amount && (
                <Text h2 medium>
                    {amount}
                </Text>
            )}
            <Flex gap="xs" fullWidth style={style.detailItemsContainer}>
                {items.map((item, idx) => (
                    <HistoryDetailItem
                        key={idx}
                        {...item}
                        // Hide the border on the last item, if we're not
                        // rendering the notes field as the last item.
                        noBorder={
                            !shouldShowNotesField && idx === items.length - 1
                        }
                    />
                ))}
                {fees && (
                    <HistoryDetailItem
                        label={t('words.fees')}
                        onPress={() => onPressFees()}
                        value={
                            <View style={style.inlineFee}>
                                <Text caption>{`${fees}`}</Text>
                                <SvgImage name="Info" size={16} />
                            </View>
                        }
                    />
                )}

                {shouldShowNotesField && (
                    <HistoryDetailItem
                        label={
                            onSaveNotes
                                ? `${t('phrases.add-note')} +`
                                : t('words.notes')
                        }
                        value={
                            <Input
                                ref={(ref: unknown) => {
                                    inputRef.current = ref as TextInput
                                }}
                                onChangeText={handleNotesInputChanged}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => {
                                    setIsFocused(false)
                                    handleSaveNotes()
                                }}
                                value={notes}
                                placeholder={t('words.optional')}
                                returnKeyType="done"
                                containerStyle={style.inputOuterContainer}
                                inputContainerStyle={[
                                    style.inputInnerContainer,
                                    isFocused
                                        ? style.focusedInputInnerContainer
                                        : {},
                                ]}
                                onSubmitEditing={handleSaveNotes}
                                inputStyle={style.input}
                                placeholderTextColor={hexToRgba(
                                    theme.colors.night,
                                    0.2,
                                )}
                                disabled={!onSaveNotes}
                                blurOnSubmit
                                multiline
                            />
                        }
                        onPress={() => {
                            if (!inputRef.current) return
                            const current: TextInput = inputRef.current
                            current.focus()
                        }}
                        noBorder
                    />
                )}
            </Flex>
            {txn.kind === 'onchainDeposit' && (
                <View style={style.checkFundsContainer}>
                    <Button
                        title={
                            checkLoading
                                ? t('words.checking')
                                : t('phrases.check-incoming-funds')
                        }
                        onPress={handleCheckIncomingFunds}
                        disabled={checkLoading}
                    />
                </View>
            )}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            width: '100%',
        },
        closeIconContainer: {
            alignSelf: 'flex-end',
        },
        checkFundsContainer: {
            width: '100%',
            paddingTop: theme.spacing.lg,
        },
        detailItemsContainer: {
            marginTop: theme.spacing.xl,
        },
        detailTitle: {
            marginTop: theme.spacing.sm,
            marginBottom: theme.spacing.xxs,
        },
        inputOuterContainer: {
            flex: 1,
            height: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            paddingRight: 0,
            minHeight: 0,
        },
        inputInnerContainer: {
            borderBottomColor: 'transparent',
            width: '100%',
            height: 'auto',
            minHeight: 0,
        },
        focusedInputInnerContainer: {
            borderBottomColor: theme.colors.primary,
        },
        input: {
            fontSize: 14,
            textAlign: 'right',
            minHeight: 0,
            paddingTop: 0,
        },
        inlineFee: {
            flexDirection: 'row',
            gap: 5,
        },
    })
