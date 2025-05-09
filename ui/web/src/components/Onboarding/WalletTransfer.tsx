import React from 'react'
import { useTranslation } from 'react-i18next'

import arrowLoopRightIcon from '@fedi/common/assets/svgs/arrow-loop-right.svg'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { Header, Title } from '../Layout'
import { Text } from '../Text'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

export const WalletTransfer: React.FC = () => {
    const { t } = useTranslation()

    return (
        <OnboardingContainer>
            <Header>
                <Title subheader>{t('feature.recovery.wallet-transfer')}</Title>
            </Header>
            <OnboardingContent fullWidth>
                <Content>
                    <Icon icon={arrowLoopRightIcon} size="lg" />
                    <Text variant="h2" weight="medium">
                        {t('feature.recovery.transfer-existing-wallet')}
                    </Text>
                    <Text variant="body">
                        {t(
                            'feature.recovery.transfer-existing-wallet-guidance-1',
                        )}
                    </Text>
                </Content>
            </OnboardingContent>
            <OnboardingActions>
                <Text variant="small" css={{ color: theme.colors.grey }}>
                    {t('feature.recovery.transfer-existing-wallet-guidance-2')}
                </Text>
                <Button width="full" href="/onboarding/recover/select-device">
                    {t('words.continue')}
                </Button>
            </OnboardingActions>
        </OnboardingContainer>
    )
}

const Content = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
})
