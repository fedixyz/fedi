import { useRouter } from 'next/router'
import { Dispatch, SetStateAction, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from './Dialog'
import { OmniInput } from './OmniInput'

type Props = {
    open: boolean
    onOpenChange: Dispatch<SetStateAction<boolean>>
}

export const ScanDialog = ({ open, onOpenChange }: Props) => {
    const { t } = useTranslation()
    const router = useRouter()

    useEffect(() => {
        const closeScanDialog = () => {
            onOpenChange(false)
        }

        router.events.on('routeChangeStart', closeScanDialog)

        return () => {
            router.events.off('routeChangeStart', closeScanDialog)
        }
    }, [router.events, onOpenChange])

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
