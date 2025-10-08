import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { RpcFederationPreview } from '@fedi/common/types/bindings'

import CustomOverlay from '../../ui/CustomOverlay'
import FederationPreview from '../onboarding/FederationPreview'

interface Props {
    preview: RpcFederationPreview | undefined
    show: boolean
    onDismiss: () => void
    onJoin: () => void
    isJoining: boolean
}

const JoinFederationOverlay: React.FC<Props> = ({
    preview,
    show,
    onDismiss,
    onJoin,
    isJoining,
}) => {
    const { t } = useTranslation()

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={onDismiss}
            contents={{
                title: t('phrases.join-federation'),
                body: preview ? (
                    <FederationPreview
                        onJoin={onJoin}
                        onBack={onDismiss}
                        federation={preview}
                        isJoining={isJoining}
                    />
                ) : (
                    <ActivityIndicator />
                ),
            }}
        />
    )
}

export default JoinFederationOverlay
