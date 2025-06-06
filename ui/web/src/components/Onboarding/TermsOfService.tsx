import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMediaQuery } from '../../hooks'
import { config } from '../../styles'
import { Button } from '../Button'
import { Header, Title } from '../Layout'
import { Text } from '../Text'
import FederationTermsPreview, {
    ExternalTosLink,
} from './FederationTermsPreview'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

interface TermsOfServiceProps {
    tosUrl: string
    onAccept: () => void | Promise<void>
}

export const TermsOfService: React.FC<TermsOfServiceProps> = ({
    tosUrl,
    onAccept,
}: TermsOfServiceProps) => {
    const isSm = useMediaQuery(config.media.sm)
    const { t } = useTranslation()
    const [hasTermsLoaded, setHasTermsLoaded] = useState(false)
    const [isAccepting, setIsAccepting] = useState(false)

    const handleAccept = useCallback(async () => {
        setIsAccepting(true)
        await onAccept()
        setIsAccepting(false)
    }, [onAccept])

    return (
        <OnboardingContainer>
            {isSm && (
                <Header back="/">
                    <Title subheader>
                        {t('feature.federations.join-federation')}
                    </Title>
                </Header>
            )}
            <OnboardingContent fullWidth>
                <Text variant="h2" weight="medium" css={{ marginBottom: 16 }}>
                    {t('feature.onboarding.terms-and-conditions')}
                </Text>
                <FederationTermsPreview
                    tosUrl={tosUrl}
                    isLoaded={hasTermsLoaded}
                    setIsLoaded={setHasTermsLoaded}
                />
                <ExternalTosLink
                    href={tosUrl}
                    target="_blank"
                    rel="noopener noreferrer">
                    {t('phrases.open-in-browser')}
                </ExternalTosLink>
            </OnboardingContent>
            <OnboardingActions>
                <Button
                    width="full"
                    href="/"
                    disabled={!hasTermsLoaded || isAccepting}
                    variant="tertiary">
                    {t('feature.onboarding.i-do-not-accept')}
                </Button>
                <Button
                    width="full"
                    onClick={handleAccept}
                    disabled={!hasTermsLoaded}
                    loading={isAccepting}>
                    {t('feature.onboarding.i-accept')}
                </Button>
            </OnboardingActions>
        </OnboardingContainer>
    )
}
