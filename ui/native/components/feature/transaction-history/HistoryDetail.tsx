import { Text, Theme, useTheme, Button } from '@rneui/themed'
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

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import {
    selectTransactionDisplayType,
    setTransactionDisplayType,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { Federation, TransactionListEntry } from '../../../types'
import Flex, { Column, Row } from '../../ui/Flex'
import NotesInput from '../../ui/NotesInput'
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
    federationId?: Federation['id']
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
    txn,
    onPressFees = () => null,
    notes: propsNotes,
    onSaveNotes,
    onClose,
    federationId = '',
}) => {
    const inputRef = useRef<TextInput | null>(null)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [notes, setNotes] = useState<string>(propsNotes || '')
    const [checkLoading, setCheckLoading] = useState(false)
    const toast = useToast()
    const transactionDisplayType = useAppSelector(selectTransactionDisplayType)
    const dispatch = useAppDispatch()
    const { fetchTransactions } = useTransactionHistory(fedimint, federationId)

    const { makeFormattedAmountsFromTxn } = useAmountFormatter({ federationId })

    const { formattedSecondaryAmount } = makeFormattedAmountsFromTxn(txn, 'end')

    // If notes prop changes, update notes state
    useEffect(() => {
        if (propsNotes !== undefined) {
            setNotes(propsNotes)
        }
    }, [propsNotes])

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
        if (!federationId) return

        setCheckLoading(true)
        try {
            await fedimint.recheckPeginAddress({
                federationId: federationId,
                operationId: txn.id,
            })
            const transactions = await fetchTransactions()
            const foundTransaction = transactions.find(
                tx =>
                    tx.kind === 'onchainDeposit' &&
                    tx.id === txn.id &&
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
    }, [federationId, txn.id, fetchTransactions, t, toast])

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
            <Column gap="sm" align="center">
                {amount && (
                    <Text h2 medium>
                        {amount}
                    </Text>
                )}
                <Pressable
                    hitSlop={10}
                    onPress={() =>
                        dispatch(
                            setTransactionDisplayType(
                                transactionDisplayType === 'sats'
                                    ? 'fiat'
                                    : 'sats',
                            ),
                        )
                    }>
                    <Row gap="xs" align="center">
                        <Text color={theme.colors.grey} medium>
                            {formattedSecondaryAmount}
                        </Text>
                        <SvgImage
                            name="Switch"
                            size={20}
                            color={theme.colors.grey}
                        />
                    </Row>
                </Pressable>
            </Column>
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
                        label={null}
                        value={
                            <NotesInput
                                notes={notes}
                                setNotes={setNotes}
                                onSave={handleSaveNotes}
                                label={t('words.notes')}
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
