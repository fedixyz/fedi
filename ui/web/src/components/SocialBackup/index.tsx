import React, { useEffect, useState } from 'react'

import { selectActiveFederationId } from '@fedi/common/redux'

import { useAppSelector } from '../../hooks'
import * as Layout from '../Layout'
import { SocialBackupDownload } from './SocialBackupDownload'
import { SocialBackupIntro } from './SocialBackupIntro'
import { SocialBackupRecord } from './SocialBackupRecord'
import { SocialBackupUpload } from './SocialBackupUpload'

export const SocialBackup: React.FC = () => {
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const [step, setStep] = useState<
        'intro' | 'record' | 'upload' | 'download' | 'complete'
    >('intro')
    const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
    const [backupBlob, setBackupBlob] = useState<Blob | null>(null)

    // If they change federations, reset state
    useEffect(() => {
        setStep('intro')
        setVideoBlob(null)
    }, [activeFederationId])

    let content: React.ReactNode = null
    if (step === 'intro') {
        content = <SocialBackupIntro next={() => setStep('record')} />
    } else if (step === 'record') {
        content = (
            <SocialBackupRecord
                next={blob => {
                    setVideoBlob(blob)
                    setStep('upload')
                }}
            />
        )
    } else if (step === 'upload' && videoBlob) {
        content = (
            <SocialBackupUpload
                videoBlob={videoBlob}
                next={blob => {
                    setBackupBlob(blob)
                    setStep('download')
                }}
            />
        )
    } else if (step === 'download' && backupBlob) {
        content = <SocialBackupDownload backupBlob={backupBlob} />
    }

    // If none of the conditions above hit, reset the component state and go back to the intro
    const needsReset = !!content
    useEffect(() => {
        if (!needsReset) return
        setStep('intro')
        setVideoBlob(null)
    }, [needsReset])

    return <Layout.Root>{content}</Layout.Root>
}
