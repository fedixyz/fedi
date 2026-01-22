import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from './Dialog'
import { OmniInput } from './OmniInput'

type Props = {
    open: boolean
    onOpenChange: Dispatch<SetStateAction<boolean>>
}

export const ScanDialog = ({ open, onOpenChange }: Props) => {
    const { t } = useTranslation()

    return (
        <Dialog title={t('words.scan')} open={open} onOpenChange={onOpenChange}>
            <OmniInput
                expectedInputTypes={[]}
                onExpectedInput={() => {}}
                onUnexpectedSuccess={() => {}}
                customActions={['paste']}
            />
        </Dialog>
    )
}
