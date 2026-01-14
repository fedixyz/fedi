import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import switchIcon from '@fedi/common/assets/svgs/switch.svg'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    selectTransactionDisplayType,
    setTransactionDisplayType,
} from '@fedi/common/redux'
import { TransactionListEntry } from '@fedi/common/types'

import {
    useAppDispatch,
    useAppSelector,
    useAutosizeTextArea,
} from '../../hooks'
import { styled, theme } from '../../styles'
import { Dialog } from '../Dialog'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { HistoryDetailItem, HistoryDetailItemProps } from './HistoryDetailItem'

export interface HistoryDetailDialogProps {
    txn: TransactionListEntry
    icon: React.ReactNode
    title: React.ReactNode
    amount: string
    items: HistoryDetailItemProps[]
    notes?: string
    onSaveNotes?: (notes: string) => void
    onClose: () => void
    federationId?: string
}

export const HistoryDetailDialog: React.FC<HistoryDetailDialogProps> = ({
    icon,
    title,
    amount,
    items,
    notes: propsNotes,
    onSaveNotes,
    onClose,
    txn,
}) => {
    const [notes, setNotes] = useState(propsNotes || '')
    const [inputEl, setInputEl] = useState<HTMLTextAreaElement | null>(null)
    const { t } = useTranslation()
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const { formattedSecondaryAmount } = makeFormattedAmountsFromMSats(
        txn.amount,
        'end',
    )

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

    const handleSaveNotes = () => {
        if (onSaveNotes && notes !== propsNotes) {
            onSaveNotes(notes)
        }
    }

    const handleClose = () => {
        handleSaveNotes()
        onClose()
    }

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
                    <Icon icon={switchIcon} size="xs" />
                </CurrencySwitch>
                <Details>
                    {items.map((item, idx) => (
                        <HistoryDetailItem key={idx} {...item} />
                    ))}
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
            </Container>
        </Dialog>
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
