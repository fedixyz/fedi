import { useNavigation } from '@react-navigation/native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { useFederationMembership } from '@fedi/common/hooks/federation'

import { fedimint } from '../../../bridge'
import CustomOverlay from '../../ui/CustomOverlay'
import FederationPreview from '../onboarding/FederationPreview'

type Props = {
    inviteCode: string
    children: React.ReactNode
    fallbackContent?: React.ReactNode
}

export default function FederationGate({
    inviteCode,
    children,
    fallbackContent,
}: Props) {
    const [isJoining, setIsJoining] = useState(true)
    const navigation = useNavigation()
    const { t } = useTranslation()
    const { isFetchingPreview, federationPreview, isMember, handleJoin } =
        useFederationMembership(t, fedimint, inviteCode)

    const handleBack = () => {
        if (navigation.canGoBack()) navigation.goBack()
    }

    if (isMember) return children

    return (
        <>
            {fallbackContent}
            <CustomOverlay
                show={isJoining}
                onBackdropPress={handleBack}
                contents={{
                    title: t('feature.federations.join-federation'),
                    body:
                        isFetchingPreview || !federationPreview ? (
                            <ActivityIndicator />
                        ) : (
                            <FederationPreview
                                federation={federationPreview}
                                onJoin={() =>
                                    handleJoin(() => setIsJoining(false))
                                }
                                onBack={handleBack}
                            />
                        ),
                }}
            />
        </>
    )
}
