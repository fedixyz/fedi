import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { useFederationMembership } from '@fedi/common/hooks/federation'

import CustomOverlay from '../../ui/CustomOverlay'
import FederationPreview from '../onboarding/FederationPreview'

type Props = {
    federationId: string
    inviteCode: string
    children: React.ReactNode
    fallbackContent?: React.ReactNode
}

export default function FederationGate({
    federationId,
    inviteCode,
    children,
    fallbackContent,
}: Props) {
    const navigation = useNavigation()
    const { t } = useTranslation()
    const {
        isJoining,
        setIsJoining,
        isFetchingPreview,
        federationPreview,
        isMember,
        handleJoin,
    } = useFederationMembership(t, federationId, inviteCode)

    const handleBack = () => {
        if (navigation.canGoBack()) navigation.goBack()
    }

    if (isMember) return children

    return (
        <>
            {fallbackContent}
            <CustomOverlay
                // This should always be shown when the user isn't a member
                show={true}
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
                                isJoining={isJoining}
                            />
                        ),
                }}
            />
        </>
    )
}
