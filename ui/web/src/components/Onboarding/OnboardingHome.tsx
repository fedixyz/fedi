import React from 'react'
import { Trans, useTranslation } from 'react-i18next'

import WorldIllustration from '@fedi/common/assets/images/illustration-world.png'
import FediLogoIcon from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import { selectFederations } from '@fedi/common/redux'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { Illustration } from '../Illustration'
import { Text } from '../Text'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

export const OnboardingHome: React.FC = () => {
    const { t } = useTranslation()
    const hasFederations = useAppSelector(selectFederations).length > 0

    return (
        <OnboardingContainer>
            <OnboardingContent>
                <IllustrationWrapper>
                    <Illustration
                        src={WorldIllustration}
                        alt=""
                        width={320}
                        height={320}
                    />
                </IllustrationWrapper>
                <Info>
                    <Icon size="lg" icon={FediLogoIcon} />
                    <Text variant="h2" weight="medium">
                        {t('feature.onboarding.welcome-to-fedi')}
                    </Text>
                    <Text>{t('feature.onboarding.chat-earn-save-spend')}</Text>
                </Info>
            </OnboardingContent>
            <OnboardingActions>
                <Button width="full" href="/onboarding/join">
                    {t('feature.federations.join-federation')}
                </Button>
                {!hasFederations && (
                    <Button
                        width="full"
                        variant="secondary"
                        href="/onboarding/recover">
                        {t('feature.onboarding.join-returning-member')}
                    </Button>
                )}
                <Terms>
                    <Text variant="small">
                        <Trans
                            i18nKey="feature.onboarding.by-clicking-you-agree-user-agreement"
                            components={{
                                anchor: (
                                    <a
                                        target="_blank"
                                        href="https://www.fedi.xyz/eula-en"
                                    />
                                ),
                            }}
                        />
                    </Text>
                </Terms>
            </OnboardingActions>
        </OnboardingContainer>
    )
}

const IllustrationWrapper = styled('div', {
    position: 'relative',
    aspectRatio: '1 / 1',
    maxWidth: '70vmin',
    maxHeight: '70vmin',
    marginBottom: 24,

    '@xs': {
        marginBottom: 16,
    },
})

const Info = styled('div', {
    maxWidth: 320,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
})

const Terms = styled('div', {
    maxWidth: 220,

    '& a': {
        color: theme.colors.blue,
    },
})
