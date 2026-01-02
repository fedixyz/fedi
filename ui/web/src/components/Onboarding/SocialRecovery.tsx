import { useRouter } from 'next/router'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import CloseIcon from '@fedi/common/assets/svgs/close.svg'
import FediFileIcon from '@fedi/common/assets/svgs/fedi-file.svg'
import { useSocialRecovery } from '@fedi/common/hooks/recovery'
import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint, writeBridgeFile } from '../../lib/bridge'
import { styled, theme } from '../../styles'
import { ActionCard } from '../ActionCard'
import { Button } from '../Button'
import { ConfirmDialog } from '../ConfirmDialog'
import { HoloLoader } from '../HoloLoader'
import { IconButton } from '../IconButton'
import * as Layout from '../Layout'
import { QRCode } from '../QRCode'
import { Text } from '../Text'

const log = makeLog('SocialRecovery')

export const SocialRecovery: React.FC = () => {
    const { t } = useTranslation()
    const { replace } = useRouter()
    const {
        hasCheckedForSocialRecovery,
        socialRecoveryQr,
        socialRecoveryState,
        isCompletingRecovery,
        fetchSocialRecovery,
        completeSocialRecovery,
        cancelSocialRecovery,
    } = useSocialRecovery()
    const [isCheckingFile, setIsCheckingFile] = useState(false)
    const [wantsCancel, setWantsCancel] = useState(false)
    const toast = useToast()

    const handleFileChange = async (
        ev: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = ev.target.files?.[0]
        if (!file) return
        setIsCheckingFile(true)
        try {
            const backupData = new Uint8Array(await file.arrayBuffer())
            writeBridgeFile('backup.fedi', backupData)
            await fedimint.validateRecoveryFile('backup.fedi')
            await fetchSocialRecovery()
            toast.show(t('feature.recovery.successfully-opened-fedi-file'))
        } catch (err) {
            log.warn('handleFileChange', err)
            toast.error(t, err, 'errors.unknown-error')
        }
        setIsCheckingFile(false)
        ev.target.value = ''
    }

    const handleComplete = async () => {
        try {
            await completeSocialRecovery()
            replace('/')
            toast.show(t('feature.recovery.you-completed-social-recovery'))
        } catch (err) {
            log.warn('handleComplete', err)
            toast.error(t, err, 'errors.unknown-error')
        }
    }

    const handleCancel = async () => {
        try {
            await cancelSocialRecovery()
            replace('/onboarding')
        } catch (err) {
            log.warn('handleCancel', err)
            toast.error(t, err, 'errors.unknown-error')
        }
    }

    let content: React.ReactNode
    let actions: React.ReactNode | undefined
    let extra: React.ReactNode | undefined
    if (!hasCheckedForSocialRecovery) {
        content = (
            <LoadingContainer>
                <HoloLoader size={180} />
            </LoadingContainer>
        )
    } else if (socialRecoveryQr) {
        content = (
            <>
                <Text>
                    {t('feature.recovery.guardian-approval-instructions')}
                </Text>
                <QRCodeContainer>
                    <QRCode data={socialRecoveryQr} />
                </QRCodeContainer>
                {socialRecoveryState ? (
                    <GuardianApprovals>
                        <GuardianApprovalsHeader>
                            <Text weight="bold">
                                {t('feature.recovery.guardian-approvals')}
                            </Text>
                            <Text weight="bold">
                                {t('feature.recovery.guardians-remaining', {
                                    guardians: socialRecoveryState.remaining,
                                })}
                            </Text>
                        </GuardianApprovalsHeader>
                        {socialRecoveryState.approvals.map((approval, idx) => (
                            <GuardianApproval key={idx}>
                                <Text ellipsize>{approval.guardianName}</Text>
                                <Text
                                    css={{
                                        color: approval.approved
                                            ? theme.colors.green
                                            : theme.colors.grey,
                                    }}>
                                    {approval.approved
                                        ? t('words.approved')
                                        : t('words.pending')}
                                </Text>
                            </GuardianApproval>
                        ))}
                    </GuardianApprovals>
                ) : (
                    <HoloLoader size={180} />
                )}
            </>
        )
        const canContinue = socialRecoveryState?.remaining === 0
        actions = canContinue && (
            <Button
                width="full"
                loading={isCompletingRecovery}
                onClick={handleComplete}>
                {t('feature.recovery.complete-social-recovery')}
            </Button>
        )
        extra = !canContinue && (
            <>
                <CloseButtonContainer>
                    <IconButton
                        icon={CloseIcon}
                        size="md"
                        onClick={() => setWantsCancel(true)}
                    />
                </CloseButtonContainer>
                <ConfirmDialog
                    open={wantsCancel}
                    title={t('feature.recovery.cancel-social-recovery')}
                    description={t(
                        'feature.recovery.cancel-social-recovery-detail',
                    )}
                    onClose={() => setWantsCancel(false)}
                    onConfirm={handleCancel}
                />
            </>
        )
    } else {
        content = (
            <>
                <Text>
                    {t('feature.recovery.social-recovery-instructions')}
                </Text>
                <ActionCard
                    icon={FediFileIcon}
                    title={t('feature.recovery.locate-social-recovery-file')}
                    description={
                        <CardTextContainer>
                            <Text>
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-1',
                                )}
                            </Text>
                            <br />
                            <Text>
                                {'  \u2022 '}
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-check-1',
                                )}
                            </Text>
                            <Text>
                                {'  \u2022 '}
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-check-2',
                                )}
                            </Text>
                            <Text>
                                {'  \u2022 '}
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-check-3',
                                )}
                            </Text>
                            <Text>
                                {'  \u2022 '}
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-check-4',
                                )}
                            </Text>
                            <br />
                            <Text>
                                {t(
                                    'feature.recovery.locate-social-recovery-instructions-3',
                                )}
                            </Text>
                            <Text weight="bold">backup.fedi</Text>
                        </CardTextContainer>
                    }
                    action={
                        <>
                            <FileInput
                                type="file"
                                onChange={handleFileChange}
                                id="backup-file-input"
                                tabIndex={-1}
                                aria-hidden="true"
                                multiple
                            />
                            <Button
                                width="full"
                                loading={isCheckingFile}
                                htmlFor="backup-file-input">
                                {t('feature.recovery.search-files')}
                            </Button>
                        </>
                    }
                />
            </>
        )
    }

    return (
        <Layout.Root>
            <Layout.Header back="/onboarding/recover">
                <Layout.Title subheader>
                    {t('feature.recovery.social-recovery')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content fullWidth>
                <Content>{content}</Content>
            </Layout.Content>
            {actions && <Layout.Actions>{actions}</Layout.Actions>}
            {extra}
        </Layout.Root>
    )
}

const LoadingContainer = styled('div', {
    flex: 1,
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
})

const FileInput = styled('input', {
    opacity: 0,
    position: 'absolute',
    zIndex: -1,
    top: 0,
    left: 0,
    width: 1,
    height: 1,
})

const Content = styled('div', {
    flex: 1,
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'center',
    gap: 16,
    padding: 20,
})

const QRCodeContainer = styled('div', {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    margin: '8px auto 16px',
})

const CardTextContainer = styled('div', {
    width: '100%',
    textAlign: 'left',
})

const GuardianApprovals = styled('div', {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
})

const GuardianApprovalsHeader = styled('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
})

const GuardianApproval = styled('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
})

const CloseButtonContainer = styled('div', {
    position: 'absolute',
    top: 16,
    right: 16,
})
