import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint, readBridgeFile, writeBridgeFile } from '../../lib/bridge'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { HoloLoader } from '../HoloLoader'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'

const log = makeLog('SocialBackupUpload')
const VIDEO_FILE_PATH = 'backup-video.webm'

interface Props {
    videoBlob: Blob
    next(backupBlob: Blob): void
    federationId: string
}

export const SocialBackupUpload: React.FC<Props> = ({
    videoBlob,
    next,
    federationId,
}) => {
    const { t } = useTranslation()
    const [error, setError] = useState<unknown>()
    const [backupBlob, setBackupBlob] = useState<Blob>()
    const [hasWaited, setHasWaited] = useState(false)
    const nextRef = useUpdatingRef(next)

    useEffect(() => {
        if (error) return
        async function upload() {
            if (!federationId) return
            try {
                // Write the video file to the bridge's file system
                const videoArray = new Uint8Array(await videoBlob.arrayBuffer())
                await writeBridgeFile(VIDEO_FILE_PATH, videoArray)
                // Upload the video and backup file
                await fedimint.uploadBackupFile(VIDEO_FILE_PATH, federationId)
                // Pull the backup file as a blob and continue to the next screen
                const path = await fedimint.locateRecoveryFile()
                const file = await readBridgeFile(path)
                const blob = new Blob([file], {
                    type: 'application/octet-stream',
                })
                setBackupBlob(blob)
            } catch (err) {
                log.error('failed to upload backup video', err)
                setError(err)
            }
        }
        upload()
    }, [federationId, videoBlob, error, nextRef])

    useEffect(() => {
        // TODO: Remove this minimum timeout until uploadBackupFile actually
        // waits on full upload, currently it's just a background task.
        const timeout = setTimeout(() => {
            setHasWaited(true)
        }, 2000)
        return () => clearTimeout(timeout)
    }, [])

    useEffect(() => {
        if (!backupBlob || !hasWaited) return
        nextRef.current(backupBlob)
    }, [backupBlob, hasWaited, nextRef])

    return (
        <>
            <Layout.Content centered>
                {error ? (
                    <Error>
                        <Icon icon={ErrorIcon} size="lg" />
                        <Text>
                            {formatErrorMessage(
                                t,
                                error,
                                'errors.unknown-error',
                            )}
                        </Text>
                        <Button onClick={() => setError(undefined)}>
                            {t('words.retry')}
                        </Button>
                    </Error>
                ) : (
                    <Content>
                        <HoloLoader size={180} />
                        <Text variant="h2" weight="medium">
                            {t('feature.backup.creating-recovery-file')}
                        </Text>
                    </Content>
                )}
            </Layout.Content>
        </>
    )
}

const Content = styled('div', {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
})

const Error = styled(Content, {
    color: theme.colors.red,
})
