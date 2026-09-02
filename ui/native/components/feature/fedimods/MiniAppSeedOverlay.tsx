import React from 'react'
import { useTranslation } from 'react-i18next'

import CustomOverlay from '../../ui/CustomOverlay'

interface Props {
    origin: string | null
    onApprove: () => void
    onDeny: () => void
}

export const MiniAppSeedOverlay: React.FC<Props> = ({
    origin,
    onApprove,
    onDeny,
}) => {
    const { t } = useTranslation()

    return (
        <CustomOverlay
            show={origin !== null}
            onBackdropPress={onDeny}
            contents={{
                title: t('feature.fedimods.seed-request-title'),
                url: origin,
                description: t('feature.fedimods.seed-request-description'),
                body: null,
                buttons: [
                    {
                        text: t('words.deny'),
                        onPress: onDeny,
                    },
                    {
                        primary: true,
                        text: t('words.approve'),
                        onPress: onApprove,
                    },
                ],
            }}
        />
    )
}
