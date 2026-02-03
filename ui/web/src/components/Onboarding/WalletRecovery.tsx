import Image from 'next/image'
import React from 'react'
import { useTranslation } from 'react-i18next'

import ProfileSecurityIcon from '@fedi/common/assets/images/profile-security.png'
import SocialRecoveryIcon from '@fedi/common/assets/images/social-recovery.png'

import { Button } from '../../components/Button'
import { Column } from '../../components/Flex'
import { Text } from '../../components/Text'
import { styled, theme } from '../../styles'
import * as Layout from '../Layout'

export const WalletRecovery: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Layout.Root>
            <Layout.Header back="/">
                <Layout.Title subheader>
                    {t('feature.recovery.choose-method')}
                </Layout.Title>
            </Layout.Header>

            <Layout.Content fullWidth>
                <Content align="center" gap="md">
                    <Text center css={{ color: theme.colors.darkGrey }}>
                        {t('feature.recovery.choose-method-instructions')}
                    </Text>
                    <Column fullWidth gap="lg">
                        <Card fullWidth center>
                            <IconContainer>
                                <Image
                                    src={ProfileSecurityIcon}
                                    alt="Profile Security Icon"
                                    width="40"
                                    height="40"
                                />
                            </IconContainer>
                            <Text center variant="h2" weight="medium">
                                {t('feature.recovery.personal-recovery')}
                            </Text>
                            <Text
                                variant="caption"
                                center
                                css={{ color: theme.colors.darkGrey }}>
                                {t('feature.recovery.personal-recovery-method')}
                            </Text>
                            <Button
                                width="full"
                                href="/onboarding/recover/personal">
                                {t('feature.recovery.start-personal-recovery')}
                            </Button>
                        </Card>
                        {/* Disabled until all social recovery/backup/assist is functional on web */}
                        <Card fullWidth center>
                            <IconContainer>
                                <Image
                                    src={SocialRecoveryIcon}
                                    alt="Social Recovery Icon"
                                    width="40"
                                    height="40"
                                />
                            </IconContainer>
                            <Text center variant="h2" weight="medium">
                                {t('feature.recovery.social-recovery')}
                            </Text>
                            <Text
                                variant="caption"
                                center
                                css={{ color: theme.colors.darkGrey }}>
                                {t('feature.recovery.social-recovery-method')}
                            </Text>
                            <Button
                                width="full"
                                variant="secondary"
                                href="/onboarding/recover/social">
                                {t('feature.recovery.start-social-recovery')}
                            </Button>
                        </Card>
                    </Column>
                </Content>
            </Layout.Content>
        </Layout.Root>
    )
}

const Content = styled(Column, {
    padding: theme.spacing.xl,
})

const Card = styled(Column, {
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: 12,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    width: '100%',
})

const IconContainer = styled('div', {
    alignItems: 'center',
    borderRadius: '100%',
    display: 'flex',
    fediGradient: 'sky',
    height: 70,
    justifyContent: 'center',
    width: 70,
})
