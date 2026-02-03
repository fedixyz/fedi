import Image from 'next/image'
import { useRouter } from 'next/router'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import SocialRecoveryFileIcon from '@fedi/common/assets/images/social-recovery-file.png'
import CloseIcon from '@fedi/common/assets/svgs/close.svg'
import FileIcon from '@fedi/common/assets/svgs/file.svg'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'
import { formatFileSize } from '@fedi/common/utils/media'

import {
    onboardingRecoverRoute,
    onboardingRecoverSocialCompleteRoute,
} from '../../constants/routes'
import { writeBridgeFile } from '../../lib/bridge'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Column, Row } from '../Flex'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'

const log = makeLog('/onboarding/recover/social')

const BACKUP_FILE_NAME = 'backup.fedi'

export const SocialRecovery = () => {
    const { t } = useTranslation()
    const { push } = useRouter()
    const toast = useToast()
    const fedimint = useFedimint()

    const [file, setFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const handleOnClick = async () => {
        if (!fileInputRef.current) return
        fileInputRef.current?.click()
    }

    const handleOnFileSelect = async (
        ev: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const uploadedFile = ev.target.files?.[0]
        if (!uploadedFile) return

        setFile(uploadedFile)
    }

    const handleProcessFile = async () => {
        if (!file) return

        try {
            setLoading(true)

            const backupData = new Uint8Array(await file.arrayBuffer())
            writeBridgeFile(BACKUP_FILE_NAME, backupData)

            // Validate the file
            await fedimint.validateRecoveryFile(BACKUP_FILE_NAME)

            push(onboardingRecoverSocialCompleteRoute)
        } catch (error) {
            log.error('Social recovery file could not be processed', error)
            toast.show({
                content: t(
                    'feature.recovery.locate-social-recovery-file-process-error',
                ),
                status: 'error',
            })
            setFile(null)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Layout.Root>
            <Layout.Header back={onboardingRecoverRoute}>
                <Layout.Title subheader>
                    {t('feature.recovery.social-recovery-title')}
                </Layout.Title>
            </Layout.Header>

            <Layout.Content fullWidth>
                <Content>
                    <Column align="center" gap="md" grow>
                        <IconContainer>
                            <Image
                                src={SocialRecoveryFileIcon}
                                alt="Social Recovery File Icon"
                                width="40"
                                height="40"
                            />
                        </IconContainer>
                        <Text variant="h2" weight="medium">
                            {t('feature.recovery.locate-social-recovery-title')}
                        </Text>
                        <Text
                            variant="caption"
                            center
                            css={{ color: theme.colors.darkGrey }}>
                            {t(
                                'feature.recovery.locate-social-recovery-instructions',
                            )}
                        </Text>
                        {file && (
                            <FileContainer align="center">
                                <Row align="center">
                                    <Icon icon={FileIcon} />
                                </Row>
                                <Column grow>
                                    <Text>{file.name}</Text>
                                    {file?.size && (
                                        <Text
                                            variant="small"
                                            css={{
                                                color: theme.colors.darkGrey,
                                            }}>
                                            {formatFileSize(file.size)}
                                        </Text>
                                    )}
                                </Column>
                                <Row
                                    align="center"
                                    onClick={() => setFile(null)}>
                                    <Icon icon={CloseIcon} />
                                </Row>
                            </FileContainer>
                        )}
                    </Column>
                    <Column>
                        <input
                            data-testid="file-upload"
                            type="file"
                            ref={fileInputRef}
                            hidden
                            onChange={handleOnFileSelect}
                        />
                        <Button
                            width="full"
                            loading={loading}
                            onClick={!file ? handleOnClick : handleProcessFile}>
                            {!file
                                ? t(
                                      'feature.recovery.locate-social-recovery-button-label',
                                  )
                                : t('words.submit')}
                        </Button>
                    </Column>
                </Content>
            </Layout.Content>
        </Layout.Root>
    )
}

const Content = styled(Column, {
    padding: theme.spacing.xl,
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

const FileContainer = styled(Row, {
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: 12,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    width: '100%',
})
