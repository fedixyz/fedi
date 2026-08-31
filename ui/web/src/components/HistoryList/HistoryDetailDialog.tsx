import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    type FeeItem,
    useTransactionHistory,
} from '@fedi/common/hooks/transactions'
import {
    cancelEcash,
    selectTransactionDisplayType,
    setTransactionDisplayType,
} from '@fedi/common/redux'
import type { TransactionListEntry } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { getCancellableEcash } from '@fedi/common/utils/transaction'

import {
    useAppDispatch,
    useAppSelector,
    useAutosizeTextArea,
} from '../../hooks'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { ConfirmDialog } from '../ConfirmDialog'
import { Dialog } from '../Dialog'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { TourTip } from '../TourTip'
import { HistoryDetailItem, HistoryDetailItemProps } from './HistoryDetailItem'

const log = makeLog('web/components/HistoryList/HistoryDetailDialog')

const FEE_TOOLTIP_WIDTH = 260
const FEE_TOOLTIP_MAX_WIDTH = 300

export interface HistoryDetailDialogProps {
    txn?: TransactionListEntry
    icon: React.ReactNode
    title: React.ReactNode
    amount: string
    secondaryAmount?: string
    items: HistoryDetailItemProps[]
    feeItems?: FeeItem[]
    notes?: string
    onSaveNotes?: (notes: string) => void
    onClose: () => void
    federationId?: string
}

export const HistoryDetailDialog: React.FC<HistoryDetailDialogProps> = ({
    icon,
    title,
    amount,
    secondaryAmount,
    items,
    feeItems,
    notes: propsNotes,
    onSaveNotes,
    onClose,
    txn,
    federationId = '',
}) => {
    const [notes, setNotes] = useState(propsNotes || '')
    const [inputEl, setInputEl] = useState<HTMLTextAreaElement | null>(null)
    const [feeTooltipOpen, setFeeTooltipOpen] = useState(false)
    const [confirmingCancel, setConfirmingCancel] = useState(false)
    const [cancelLoading, setCancelLoading] = useState(false)
    const { t } = useTranslation()
    const fedimint = useFedimint()
    const toast = useToast()
    const { fetchTransactions } = useTransactionHistory(federationId)
    const { makeFormattedAmountsFromTxn } = useAmountFormatter()
    const totalFeeItem = feeItems?.find(
        item => item.label === t('phrases.total-fees'),
    )
    const formattedSecondaryAmount =
        secondaryAmount ??
        (txn
            ? makeFormattedAmountsFromTxn(txn, 'end').formattedSecondaryAmount
            : undefined)

    const dispatch = useAppDispatch()
    const transactionDisplayType = useAppSelector(selectTransactionDisplayType)

    useAutosizeTextArea(inputEl, notes)

    // If notes prop changes, update notes state
    useEffect(() => {
        if (propsNotes !== undefined) {
            setNotes(propsNotes)
        }
    }, [propsNotes])

    const handleNotesInputChanged = (
        ev: React.ChangeEvent<HTMLTextAreaElement>,
    ) => {
        setNotes(ev.target.value)
    }

    const handleSaveNotes = useCallback(() => {
        if (onSaveNotes && notes !== propsNotes) {
            onSaveNotes(notes)
        }
    }, [notes, onSaveNotes, propsNotes])

    const handleClose = useCallback(() => {
        handleSaveNotes()
        onClose()
    }, [handleSaveNotes, onClose])

    const ecashToCancel = txn ? getCancellableEcash(txn) : undefined

    const handleCancelEcash = useCallback(async () => {
        if (!ecashToCancel) return

        setCancelLoading(true)
        try {
            await dispatch(
                cancelEcash({ fedimint, ecash: ecashToCancel }),
            ).unwrap()
            toast.show({
                status: 'success',
                content: t('phrases.canceled-ecash-send'),
            })
            handleClose()
        } catch (e) {
            log.error('Failed to cancel ecash send', e)
            toast.error(t, e)
        } finally {
            setCancelLoading(false)
            setConfirmingCancel(false)
            // a failed cancel also updates the send's state: it proves the
            // recipient claimed the notes
            fetchTransactions().catch(err =>
                log.error('Failed to refresh transactions after cancel', err),
            )
        }
    }, [
        dispatch,
        ecashToCancel,
        fedimint,
        fetchTransactions,
        handleClose,
        t,
        toast,
    ])

    return (
        <Dialog open onOpenChange={handleClose}>
            <Container>
                <IconWrap>{icon}</IconWrap>
                <Text>{title}</Text>
                {amount && (
                    <Text variant="h2" weight="medium">
                        {amount}
                    </Text>
                )}
                <CurrencySwitch
                    onClick={() =>
                        dispatch(
                            setTransactionDisplayType(
                                transactionDisplayType === 'fiat'
                                    ? 'sats'
                                    : 'fiat',
                            ),
                        )
                    }>
                    <Text css={{ color: theme.colors.grey }}>
                        {formattedSecondaryAmount}
                    </Text>
                    <Icon icon="Switch" size="xs" />
                </CurrencySwitch>
                <Details>
                    {items.map((item, idx) => (
                        <HistoryDetailItem key={idx} {...item} />
                    ))}
                    {totalFeeItem && (
                        <HistoryDetailItem
                            label={t('words.fees')}
                            center
                            value={
                                <FeeValue>
                                    <FeeDetailsTourTip
                                        feeItems={feeItems ?? []}
                                        open={feeTooltipOpen}
                                        onOpenChange={setFeeTooltipOpen}
                                        title={t('phrases.fee-details')}
                                    />
                                    <Text variant="caption">
                                        {totalFeeItem.formattedAmount}
                                    </Text>
                                </FeeValue>
                            }
                        />
                    )}
                    {onSaveNotes && (
                        <HistoryDetailItem
                            label={`${t('phrases.add-note')} +`}
                            value={
                                <NotesInput
                                    ref={ref => setInputEl(ref)}
                                    onChange={handleNotesInputChanged}
                                    onBlur={() => {
                                        handleSaveNotes()
                                    }}
                                    value={notes}
                                    placeholder={t('words.optional')}
                                />
                            }
                            onClick={() => {
                                inputEl?.focus()
                            }}
                        />
                    )}
                </Details>
                {ecashToCancel && (
                    <>
                        <CancelButton
                            width="full"
                            variant="tertiary"
                            loading={cancelLoading}
                            disabled={cancelLoading}
                            onClick={() => setConfirmingCancel(true)}>
                            {t('feature.send.cancel-send')}
                        </CancelButton>
                        <ConfirmDialog
                            open={confirmingCancel}
                            title={t('phrases.please-confirm')}
                            description={t('feature.send.cancel-notes-warning')}
                            primaryButtonLabel={t('words.continue')}
                            secondaryButtonLabel={t('phrases.go-back')}
                            onConfirm={handleCancelEcash}
                            onClose={() => setConfirmingCancel(false)}
                        />
                    </>
                )}
            </Container>
        </Dialog>
    )
}

interface FeeDetailsTourTipProps {
    feeItems: FeeItem[]
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
}

const FeeDetailsTourTip: React.FC<FeeDetailsTourTipProps> = ({
    feeItems,
    open,
    onOpenChange,
    title,
}) => {
    return (
        <TourTip
            open={open}
            onOpenChange={onOpenChange}
            side="bottom"
            align="center"
            maxWidth={FEE_TOOLTIP_MAX_WIDTH}
            content={
                <FeeTooltipContent>
                    <Text variant="caption" weight="medium">
                        {title}
                    </Text>
                    <FeeTooltipRows>
                        {feeItems.map(({ label, formattedAmount }, idx) => (
                            <FeeTooltipRow key={idx}>
                                <FeeTooltipLabel>
                                    <Text variant="caption">{label}</Text>
                                </FeeTooltipLabel>
                                <FeeTooltipAmount>
                                    <Text variant="caption" weight="medium">
                                        {formattedAmount}
                                    </Text>
                                </FeeTooltipAmount>
                            </FeeTooltipRow>
                        ))}
                    </FeeTooltipRows>
                </FeeTooltipContent>
            }>
            <FeeInfoButton
                type="button"
                aria-label={title}
                onClick={ev => {
                    ev.stopPropagation()
                    onOpenChange(true)
                }}>
                <Icon icon="Info" size="xs" />
            </FeeInfoButton>
        </TourTip>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    paddingTop: 24,
})

const IconWrap = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
})

const Details = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    marginTop: 16,
})

const CancelButton = styled(Button, {
    color: theme.colors.red,
    marginTop: theme.spacing.lg,
})

const NotesInput = styled('textarea', {
    textAlign: 'right',
    border: 'none',
    resize: 'none',
    fontSize: theme.fontSizes.caption,
    color: theme.colors.primary,
    padding: 0,

    '&:focus, &:active': {
        outline: 'none',
    },
})

const CurrencySwitch = styled('button', {
    cursor: 'pointer',
    color: theme.colors.grey,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
})

const FeeValue = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.xxs,
    width: '100%',
})

const FeeInfoButton = styled('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: 0,
    background: 'transparent',
    color: theme.colors.black,
    cursor: 'pointer',
    lineHeight: 0,
})

const FeeTooltipContent = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    boxSizing: 'border-box',
    maxWidth: '100%',
    width: FEE_TOOLTIP_WIDTH,
})

const FeeTooltipRows = styled('div', {
    display: 'flex',
    flexDirection: 'column',
})

const FeeTooltipRow = styled('div', {
    display: 'grid',
    gridTemplateColumns: '40% minmax(0, 1fr)',
    columnGap: theme.spacing.md,
    padding: `${theme.spacing.xs} 0`,
    textAlign: 'left',
    minWidth: 0,

    '&:not(:last-child)': {
        borderBottom: `1px solid ${theme.colors.blue100}`,
    },
})

const FeeTooltipLabel = styled('div', {
    minWidth: 0,
    overflowWrap: 'anywhere',
})

const FeeTooltipAmount = styled('div', {
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'right',
})
