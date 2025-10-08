import { useRouter } from 'next/router'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import FediFileIcon from '@fedi/common/assets/svgs/fedi-file.svg'
import { useToast } from '@fedi/common/hooks/toast'

import { styled } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'

interface Props {
    backupBlob: Blob
}

export const SocialBackupDownload: React.FC<Props> = ({ backupBlob }) => {
    const { t } = useTranslation()
    const { push } = useRouter()
    const [hasSaved, setHasSaved] = useState(false)
    const toast = useToast()

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

    const handleComplete = () => {
        toast.show(t('feature.backup.successfully-backed-up'))
        push('/home')
    }

    return (
        <>
            <Layout.Content>
                <Content>
                    <IconContainer>
                        <Icon icon={FediFileIcon} size="lg" />
                    </IconContainer>
                    <Text weight="bold">
                        {t('feature.backup.save-your-wallet-backup-file')}
                    </Text>
                    <Text>
                        {t('feature.backup.save-your-wallet-backup-file-where')}
                    </Text>
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Button
                    variant={hasSaved ? 'tertiary' : 'primary'}
                    width="full"
                    onClick={handleDownload}>
                    {hasSaved
                        ? t('feature.backup.save-your-wallet-backup-file-again')
                        : t('feature.backup.save-file')}
                </Button>
                {hasSaved && (
                    <Button width="full" onClick={handleComplete}>
                        {t('words.complete')}
                    </Button>
                )}
            </Layout.Actions>
        </>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    alignSelf: 'center',
    gap: 16,
    maxWidth: 280,
})

const IconContainer = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 180,
    aspectRatio: '1/1',
    borderRadius: '100%',
    fediGradient: 'sky',
})
