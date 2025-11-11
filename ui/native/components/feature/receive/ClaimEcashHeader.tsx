import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectOnboardingCompleted } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import Header from '../../ui/Header'

const ClaimEcashHeader: React.FC = () => {
    const { t } = useTranslation()

    const onboardingCompleted = useAppSelector(selectOnboardingCompleted)

    if (!onboardingCompleted) return null

    return (
        <Header
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.ecash.claim-ecash')}
                </Text>
            }
        />
    )
}

export default ClaimEcashHeader
