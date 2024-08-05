import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectMatrixAuth } from '@fedi/common/redux'

import { useAppSelector } from '../../hooks'
import { styled } from '../../styles'
import { Avatar } from '../Avatar'
import { Button } from '../Button'
import { Text } from '../Text'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

export const OnboardingComplete: React.FC = () => {
    const { t } = useTranslation()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    return (
        <OnboardingContainer>
            <OnboardingContent>
                <AvatarWrapper>
                    <Avatar
                        id={matrixAuth?.userId || ''}
                        name={matrixAuth?.displayName || '?'}
                        src={matrixAuth?.avatarUrl || undefined}
                        size="lg"
                    />
                </AvatarWrapper>
                <Text variant="h2" weight="medium">
                    {t('feature.onboarding.nice-to-meet-you', {
                        username: matrixAuth?.displayName,
                    })}
                </Text>
                <Text>{t('feature.onboarding.greeting-instructions')}</Text>
            </OnboardingContent>
            <OnboardingActions>
                <Button width="full" href="/chat">
                    {t('feature.onboarding.continue-to-fedi')}
                </Button>
            </OnboardingActions>
        </OnboardingContainer>
    )
}

const AvatarWrapper = styled('div', {
    marginBottom: 8,
})
