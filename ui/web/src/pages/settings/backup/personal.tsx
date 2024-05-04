import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { SeedWords } from '@fedi/common/types'

import { Button } from '../../../components/Button'
import { Checkbox } from '../../../components/Checkbox'
import { ContentBlock } from '../../../components/ContentBlock'
import * as Layout from '../../../components/Layout'
import { RecoverySeedWords } from '../../../components/RecoverySeedWords'
import { Text } from '../../../components/Text'
import { fedimint } from '../../../lib/bridge'
import { styled } from '../../../styles'

function PersonalBackupPage() {
    const { t } = useTranslation()
    const { show, error } = useToast()
    const [words, setWords] = useState<SeedWords>([])
    const [isShowingWords, setIsShowingWords] = useState(false)
    const [hasCheckedGuidance1, setHasCheckedGuidance1] = useState(false)
    const [hasCheckedGuidance2, setHasCheckedGuidance2] = useState(false)

    useEffect(() => {
        if (!isShowingWords) return
        fedimint
            .getMnemonic()
            .then(mnemonic => setWords(mnemonic))
            .catch(err => error(err, 'errors.unknown-error'))
    }, [isShowingWords, error])

    const handleFinish = useCallback(() => {
        show({
            content: t('feature.backup.backed-up-recovery-words'),
        })
    }, [show, t])

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
                                <Text>
                                    {t(
                                        'feature.backup.recovery-words-instructions',
                                    )}
                                </Text>
                                <RecoverySeedWords words={words} readOnly />
                            </Content>
                        </Layout.Content>
                        <Layout.Actions>
                            <Button
                                width="full"
                                href="/"
                                onClick={handleFinish}>
                                {t('words.done')}
                            </Button>
                        </Layout.Actions>
                    </>
                ) : (
                    <>
                        <Layout.Content>
                            <Content>
                                <Checkbox
                                    label={t(
                                        'feature.backup.personal-backup-guidance-check-1',
                                    )}
                                    checked={hasCheckedGuidance1}
                                    onChange={setHasCheckedGuidance1}
                                />
                                <Checkbox
                                    label={t(
                                        'feature.backup.personal-backup-guidance-check-2',
                                    )}
                                    checked={hasCheckedGuidance2}
                                    onChange={setHasCheckedGuidance2}
                                />
                            </Content>
                        </Layout.Content>
                        <Layout.Actions>
                            <Button
                                width="full"
                                disabled={
                                    !hasCheckedGuidance1 || !hasCheckedGuidance2
                                }
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
