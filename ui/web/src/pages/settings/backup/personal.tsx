import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import WordListIcon from '@fedi/common/assets/svgs/word-list.svg'
import { useNuxStep } from '@fedi/common/hooks/nux'
import { useToast } from '@fedi/common/hooks/toast'
import { SeedWords } from '@fedi/common/types'

import { Avatar } from '../../../components/Avatar'
import { Button } from '../../../components/Button'
import { ContentBlock } from '../../../components/ContentBlock'
import * as Layout from '../../../components/Layout'
import { RecoverySeedWords } from '../../../components/RecoverySeedWords'
import { Text } from '../../../components/Text'
import { useMediaQuery } from '../../../hooks'
import { fedimint } from '../../../lib/bridge'
import { config, styled } from '../../../styles'

function PersonalBackupPage() {
    const { t } = useTranslation()
    const { error } = useToast()
    const [words, setWords] = useState<SeedWords>([])

    const router = useRouter()
    const isSm = useMediaQuery(config.media.sm)
    const [hasPerformedPersonalBackup, completePersonalBackup] = useNuxStep(
        'hasPerformedPersonalBackup',
    )

    const [isShowingWords, setIsShowingWords] = useState(
        hasPerformedPersonalBackup,
    )

    useEffect(() => {
        if (!isShowingWords) return
        fedimint
            .getMnemonic()
            .then(mnemonic => setWords(mnemonic))
            .catch(err => error(err, 'errors.unknown-error'))
    }, [isShowingWords, error])

    const handleFinish = useCallback(() => {
        completePersonalBackup()
        router.push('/home')
    }, [completePersonalBackup, router])

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/settings/backup">
                    <Layout.Title subheader>
                        {t('feature.backup.personal-backup')}
                    </Layout.Title>
                </Layout.Header>
                {isShowingWords ? (
                    <>
                        <Layout.Content>
                            <Content>
                                {isSm && (
                                    <Text variant="h2" weight="normal">
                                        {t('feature.backup.recovery-words')}
                                    </Text>
                                )}
                                <Text>
                                    {t(
                                        'feature.backup.recovery-words-instructions',
                                    )}
                                </Text>
                                <RecoverySeedWords words={words} readOnly />
                            </Content>
                        </Layout.Content>
                        <Layout.Actions>
                            <Button width="full" onClick={handleFinish}>
                                {t('words.done')}
                            </Button>
                        </Layout.Actions>
                    </>
                ) : (
                    <>
                        <Layout.Content>
                            <Content css={{ justifyContent: 'center' }}>
                                {isSm && (
                                    <>
                                        <Avatar
                                            size="lg"
                                            id=""
                                            name="list"
                                            holo
                                            icon={WordListIcon}
                                            css={{ alignSelf: 'center' }}
                                        />
                                        <Text
                                            variant="h2"
                                            weight="normal"
                                            css={{ textAlign: 'center' }}>
                                            {t(
                                                'feature.backup.personal-backup',
                                            )}
                                        </Text>
                                    </>
                                )}
                                <Text
                                    css={{
                                        textAlign: isSm ? 'center' : 'left',
                                    }}>
                                    {t(
                                        'feature.backup.start-personal-backup-instructions',
                                    )}
                                </Text>
                            </Content>
                        </Layout.Content>
                        <Layout.Actions>
                            <Button
                                width="full"
                                onClick={() => setIsShowingWords(true)}>
                                {t('words.continue')}
                            </Button>
                        </Layout.Actions>
                    </>
                )}
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

export default PersonalBackupPage
