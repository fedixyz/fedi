import Image from 'next/image'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import SocialRecoveryFileIcon from '@fedi/common/assets/images/social-recovery-file.png'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import * as Layout from '../Layout'
import { Text } from '../Text'

interface Props {
    backupBlob: Blob
    next(): void
}

export const SocialBackupDownload: React.FC<Props> = ({ backupBlob, next }) => {
    const { t } = useTranslation()
    const [hasSaved, setHasSaved] = useState(false)

    const handleDownload = () => {
        const url = URL.createObjectURL(backupBlob)
        const hiddenElement = document.createElement('a')
        hiddenElement.href = url
        hiddenElement.download = 'backup.fedi'
        hiddenElement.click()
        // Slight delay so that this triggers after the browser shows it's downloading
        setTimeout(() => {
            setHasSaved(true)
        }, 500)
    }

    return (
        <>
            <Layout.Content>
                <Content>
                    <IconContainer>
                        <Image
                            src={SocialRecoveryFileIcon}
                            alt="Social Recovery File Icon"
                            width="60"
                            height="60"
                        />
                    </IconContainer>
                    <Text center variant="h2" weight="bold">
                        {t('feature.backup.complete-backup-save-file')}
                    </Text>
                    <Text center>
                        {t('feature.backup.complete-backup-save-file-help')}
                    </Text>
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Button width="full" onClick={hasSaved ? next : handleDownload}>
                    {hasSaved ? t('words.done') : t('feature.backup.save-file')}
                </Button>
            </Layout.Actions>
        </>
    )
}

const Content = styled('div', {
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    width: '100%',
    gap: theme.spacing.lg,
})

const IconContainer = styled('div', {
    alignItems: 'center',
    borderRadius: '100%',
    display: 'flex',
    fediGradient: 'sky',
    height: 120,
    justifyContent: 'center',
    width: 120,
})
