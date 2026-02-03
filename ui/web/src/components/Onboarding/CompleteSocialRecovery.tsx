import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import UserIcon from '@fedi/common/assets/svgs/user.svg'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { completeSocialRecovery } from '@fedi/common/redux'
import type { GuardianApproval, SocialRecoveryEvent } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { CopyInput } from '../../components/CopyInput'
import {
    onboardingRecoverSelectDeviceRoute,
    onboardingRecoverSocialRoute,
} from '../../constants/routes'
import { useAppDispatch } from '../../hooks'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Column, Row } from '../Flex'
import { HoloLoader } from '../HoloLoader'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { QRCode } from '../QRCode'
import Success from '../Success'
import { Text } from '../Text'

const log = makeLog('/onboarding/recover/social/complete')

export const CompleteSocialRecovery = () => {
    const { t } = useTranslation()
    const { push } = useRouter()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()

    const [recovering, setRecovering] = useState(false)
    const [recoveryQrCode, setRecoveryQrCode] = useState<string>('')
    const [approvals, setApprovals] = useState<SocialRecoveryEvent | null>(null)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        const getRecoveryAssistCode = async () => {
            try {
                const recoveryAssistCode = await fedimint.recoveryQr()

                // add fedimint:recovery: prefix so that it can be parsed by Fedi app
                setRecoveryQrCode(
                    `fedimint:recovery:${JSON.stringify(recoveryAssistCode)}`,
                )
            } catch (error) {
                toast.error(t, error)
            }
        }

        getRecoveryAssistCode()
    }, [toast, t, fedimint])

    // ask bridge for social recovery status every second
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                log.info('Checking for social recovery approvals...')
                if (recovering === false && recoveryQrCode) {
                    const _approvals = await fedimint.socialRecoveryApprovals()
                    setApprovals(_approvals)
                }
            } catch (e) {
                toast.show({
                    content: t('errors.failed-to-fetch-guardian-approval'),
                    status: 'error',
                })
                log.error('failed to get approvals', e)
            }
        }, 3000)

        return () => clearInterval(interval)
    }, [toast, recovering, recoveryQrCode, setApprovals, t, fedimint])

    useEffect(() => {
        const completeRecovery = async () => {
            try {
                await dispatch(
                    completeSocialRecovery({
                        fedimint,
                    }),
                ).unwrap()
                setRecovering(false)
                setSuccess(true)
            } catch (error) {
                setRecovering(false)
                log.error('completeRecovery', error)
                toast.show({
                    content: t('errors.recovery-failed'),
                    status: 'error',
                })
            }
        }
        if (recovering) {
            completeRecovery()
        }
    }, [dispatch, recovering, toast, t, fedimint])

    const handleOnBack = async () => {
        try {
            await fedimint.cancelSocialRecovery()
            log.info('Social recovery cancelled')
            push(onboardingRecoverSocialRoute)
        } catch {
            log.error('Social recovery could not be cancelled')
        }
    }

    const renderGuardians = () => {
        if (!approvals?.approvals) return null

        return approvals.approvals.map((approval: GuardianApproval, i) => {
            return (
                <Row gap="sm" justify="between" align="center" key={`gr-${i}`}>
                    <IconContainer>
                        <Icon icon={UserIcon} size="xs" />
                    </IconContainer>
                    <Text variant="caption" css={{ flex: 1 }}>
                        {approval.guardianName}
                    </Text>
                    <Text variant="caption">
                        {approval.approved
                            ? t('words.approved')
                            : t('words.pending')}
                    </Text>
                </Row>
            )
        })
    }

    // Show loading indicator until we have approvals
    if (!approvals) {
        return (
            <Column grow center>
                <HoloLoader size="lg" />
            </Column>
        )
    }

    if (success) {
        return (
            <Success
                title={t('feature.recovery.you-completed-social-recovery')}
                buttonText={t('words.okay')}
                onClick={() => push(onboardingRecoverSelectDeviceRoute)}
            />
        )
    }

    return (
        <Layout.Root>
            <Layout.Header back={handleOnBack}>
                <Layout.Title subheader>
                    {t('feature.recovery.social-recovery-title')}
                </Layout.Title>
            </Layout.Header>

            <Layout.Content fullWidth>
                <ScrollableContent align="center" gap="lg" grow>
                    <Text variant="h2" center weight="medium">
                        {t('feature.recovery.complete-social-recovery-title')}
                    </Text>
                    <Text
                        variant="caption"
                        center
                        css={{ color: theme.colors.darkGrey }}>
                        {t(
                            'feature.recovery.complete-social-recovery-description',
                        )}
                    </Text>
                    <Column gap="lg" fullWidth>
                        <QRCode data={recoveryQrCode} />
                        <CopyInput
                            value={recoveryQrCode}
                            onCopyMessage={t('phrases.copied-to-clipboard')}
                        />
                    </Column>
                    <Column grow gap="sm" fullWidth>
                        <Row fullWidth justify="between">
                            <Text weight="bold">
                                {t('feature.recovery.guardian-approvals')}
                            </Text>
                            <Text weight="bold">
                                {approvals?.remaining === 0
                                    ? t('words.complete')
                                    : `(${approvals?.remaining} ${t('words.remaining')})`}
                            </Text>
                        </Row>
                        {renderGuardians()}
                    </Column>
                </ScrollableContent>
                <ButtonContainer>
                    <Button
                        width="full"
                        loading={recovering}
                        disabled={approvals?.remaining > 0}
                        onClick={() => setRecovering(true)}>
                        {t('feature.recovery.complete-social-recovery')}
                    </Button>
                </ButtonContainer>
            </Layout.Content>
        </Layout.Root>
    )
}

const ScrollableContent = styled(Column, {
    overflowY: 'scroll',
    padding: theme.spacing.xl,
    paddingTop: 0,
})

const IconContainer = styled('div', {
    alignItems: 'center',
    borderRadius: '100%',
    display: 'flex',
    fediGradient: 'sky',
    height: 30,
    justifyContent: 'center',
    width: 30,
})

const ButtonContainer = styled(Column, {
    background: theme.colors.white,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    paddingBottom: 20,
    zIndex: 10,
})
