import { useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useFedimint } from '@fedi/common/hooks/fedimint'

import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'

type SocialRecoveryHeaderProps = {
    backButton?: boolean
    cancelSocialRecovery?: boolean
}

const SocialRecoveryHeader: React.FC<SocialRecoveryHeaderProps> = ({
    backButton = false,
    cancelSocialRecovery = false,
}: SocialRecoveryHeaderProps) => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const fedimint = useFedimint()

    async function handleCancelSocialRecovery() {
        await fedimint.cancelSocialRecovery()
        navigation.goBack()
    }

    return (
        <Header
            backButton={backButton}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.recovery.social-recovery-title')}
                </Text>
            }
            {...(cancelSocialRecovery
                ? { onBackButtonPress: handleCancelSocialRecovery }
                : {})}
        />
    )
}

export default SocialRecoveryHeader
