import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { MSats } from '@fedi/common/types'

import { useAutosizeTextArea } from '../../hooks'
import { styled, theme } from '../../styles'
import { Dialog } from '../Dialog'
import { Text } from '../Text'
import { HistoryDetailItem, HistoryDetailItemProps } from './HistoryDetailItem'

export interface HistoryDetailDialogProps {
    icon: React.ReactNode
    title: React.ReactNode
    amount: MSats | string
    items: HistoryDetailItemProps[]
    notes?: string
    onSaveNotes?: (notes: string) => void
    onClose: () => void
}

export const HistoryDetailDialog: React.FC<HistoryDetailDialogProps> = ({
    icon,
    title,
    amount,
    items,
    notes: propsNotes,
    onSaveNotes,
    onClose,
}) => {
    const { t } = useTranslation()
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const [notes, setNotes] = useState(propsNotes || '')
    const [inputEl, setInputEl] = useState<HTMLTextAreaElement | null>(null)
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

    let amountText: string | undefined
    if (typeof amount === 'string') {
        amountText = amount
    } else if (amount !== 0) {
        const { formattedPrimaryAmount } = makeFormattedAmountsFromMSats(amount)
        amountText = formattedPrimaryAmount
    }

    return (
        <Dialog size="sm" open onOpenChange={handleClose}>
            <Container>
                <IconWrap>{icon}</IconWrap>
                <Text>{title}</Text>
                {amountText && (
                    <Text variant="h2" weight="medium">
                        {amountText}
                    </Text>
                )}
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
