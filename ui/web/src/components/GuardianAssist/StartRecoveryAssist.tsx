import Image from 'next/image'
import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import KeyringIcon from '@fedi/common/assets/images/keyring.png'
import { useToast } from '@fedi/common/hooks/toast'
import { selectAuthenticatedGuardian } from '@fedi/common/redux'

import { Button } from '../../components/Button'
import { Column, Row } from '../../components/Flex'
import * as Layout from '../../components/Layout'
import { Text } from '../../components/Text'
import { settingsScanSocialRecoveryCodeRoute } from '../../constants/routes'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

export function StartRecoveryAssistPage() {
    const { t } = useTranslation()
    const toast = useToast()
    const router = useRouter()

    const authenticatedGuardian = useAppSelector(selectAuthenticatedGuardian)

    const steps = [
        t('feature.recovery.recovery-assist-step-1'),
        t('feature.recovery.recovery-assist-step-2'),
        t('feature.recovery.recovery-assist-step-3'),
        t('feature.recovery.recovery-assist-step-4'),
    ]

    const handleContinue = () => {
        if (!authenticatedGuardian) {
            return toast.error(t, 'errors.failed-to-authenticate-guardian')
        }
        router.push(settingsScanSocialRecoveryCodeRoute)
    }

    return (
        <Layout.Root>
            <Layout.Header back>
                <Layout.Title subheader>
                    {t('feature.recovery.recovery-assist')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Content>
                    <Column align="center" gap="md">
                        <IconContainer>
                            <Image
                                src={KeyringIcon}
                                alt="Keyring Icon"
                                width={40}
                                height={40}
                            />
                        </IconContainer>
                        <Text
                            variant="h2"
                            weight="medium"
                            center
                            css={{ lineHeight: 1.1 }}>
                            {t('feature.recovery.recovery-assist-title')}
                        </Text>
                        <Text
                            variant="caption"
                            center
                            css={{ color: theme.colors.darkGrey }}>
                            {t('feature.recovery.recovery-assist-subtitle')}
                        </Text>
                        <Box gap="md">
                            <Text weight="bold" css={{ fontSize: 20 }}>
                                {t('words.steps')}
                            </Text>
                            <Column gap="md">
                                {steps.map((step, index) => (
                                    <Row align="center" gap="sm" key={step}>
                                        <StepNumber>
                                            <Text variant="small" weight="bold">
                                                {index + 1}
                                            </Text>
                                        </StepNumber>
                                        <Text variant="caption">{step}</Text>
                                    </Row>
                                ))}
                            </Column>
                        </Box>
                    </Column>
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Button width="full" onClick={handleContinue}>
                    {t('words.continue')}
                </Button>
            </Layout.Actions>
        </Layout.Root>
    )
}

const Content = styled(Column, {})

const IconContainer = styled('div', {
    alignItems: 'center',
    borderRadius: '100%',
    display: 'flex',
    fediGradient: 'sky',
    height: 74,
    justifyContent: 'center',
    width: 74,
})

const Box = styled(Column, {
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: 12,
    padding: theme.spacing.lg,
    width: '100%',
})

const StepNumber = styled('div', {
    alignItems: 'center',
    borderRadius: '100%',
    display: 'flex',
    fediGradient: 'sky',
    height: 30,
    flexShrink: 0,
    justifyContent: 'center',
    width: 30,
})
