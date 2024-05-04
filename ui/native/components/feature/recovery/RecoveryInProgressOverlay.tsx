import React from 'react'
import { useTranslation } from 'react-i18next'

import CustomOverlay from '../../ui/CustomOverlay'
import RecoveryInProgress from './RecoveryInProgress'

interface Props {
    show: boolean
    label: string
    onDismiss: () => void
}

export const RecoveryInProgressOverlay: React.FC<Props> = ({
    show,
    label,
    onDismiss,
}) => {
    const { t } = useTranslation()

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={() => onDismiss()}
            contents={{
                title: '',
                body: <RecoveryInProgress label={label} />,
                buttons: [
                    {
                        primary: true,
                        text: t('words.okay'),
                        onPress: () => onDismiss(),
                    },
                ],
            }}
        />
    )
}
