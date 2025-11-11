import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { type CommunityPreview as CommunityPreviewType } from '@fedi/common/types'

import CustomOverlay from '../../ui/CustomOverlay'
import CommunityPreview from '../onboarding/CommunityPreview'

interface Props {
    preview: CommunityPreviewType | undefined
    show: boolean
    onDismiss: () => void
    onJoin: () => void
    isJoining: boolean
}

const JoinCommunityOverlay: React.FC<Props> = ({
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
                title: t('phrases.join-community'),
                body: preview ? (
                    <CommunityPreview
                        onJoin={onJoin}
                        onBack={onDismiss}
                        community={preview}
                        isJoining={isJoining}
                    />
                ) : (
                    <ActivityIndicator />
                ),
            }}
        />
    )
}

export default JoinCommunityOverlay
