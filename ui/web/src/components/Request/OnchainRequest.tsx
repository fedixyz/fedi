import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NoteInput, QRContainer } from '.'
import { CopyInput } from '../CopyInput'
import { QRCode } from '../QRCode'

export default function OnchainRequest({
    address,
    onSaveNotes,
}: {
    address: string | null
    onSaveNotes: (notes: string) => void
}) {
    const { t } = useTranslation()
    const [notes, setNotes] = useState('')

    return (
        <QRContainer>
            <QRCode data={address} />
            <NoteInput
                value={notes}
                placeholder={t('phrases.add-note')}
                onChange={e => setNotes(e.currentTarget.value)}
                onBlur={() => onSaveNotes(notes)}
            />
            <CopyInput
                value={address || ''}
                onCopyMessage={t('feature.receive.copied-payment-code')}
            />
        </QRContainer>
    )
}
