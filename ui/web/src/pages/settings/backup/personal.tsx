import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import WarningIcon from '@fedi/common/assets/svgs/warning.svg'
import WordListIcon from '@fedi/common/assets/svgs/word-list.svg'
import { useNuxStep } from '@fedi/common/hooks/nux'
import { useToast } from '@fedi/common/hooks/toast'
import { SeedWords } from '@fedi/common/types'

import { Button } from '../../../components/Button'
import { ContentBlock } from '../../../components/ContentBlock'
import { Column, Row } from '../../../components/Flex'
import { Icon } from '../../../components/Icon'
import * as Layout from '../../../components/Layout'
import { RecoverySeedWords } from '../../../components/RecoverySeedWords'
import { Text } from '../../../components/Text'
import { fedimint } from '../../../lib/bridge'
import { styled, theme } from '../../../styles'

function PersonalBackupPage() {
    const { t } = useTranslation()
    const { error } = useToast()
    const router = useRouter()

    const [, completePersonalBackup] = useNuxStep('hasPerformedPersonalBackup')

    const [words, setWords] = useState<SeedWords>([])

    useEffect(() => {
        fedimint
            .getMnemonic()
            .then(mnemonic => setWords(mnemonic))
            .catch(err => error(err, 'errors.unknown-error'))
    }, [error])

    const handleFinish = () => {
        completePersonalBackup()
        router.back()
    }

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back>
                    <Layout.Title subheader>
                        {t('feature.backup.personal-backup')}
                    </Layout.Title>
                </Layout.Header>

                <Layout.Content>
                    <Content>
                        <Column gap="md" align="center">
                            <IconWrapper>
                                <Icon icon={WordListIcon} size="md" />
                            </IconWrapper>
                            <Text
                                variant="h2"
                                weight="bold"
                                css={{ textAlign: 'center' }}>
                                {t('feature.backup.personal-backup-title')}
                            </Text>

                            <Text
                                variant="small"
                                css={{
                                    textAlign: 'center',
                                    color: theme.colors.darkGrey,
                                }}>
                                {t(
                                    'feature.backup.personal-backup-description',
                                )}
                            </Text>
                            <WarningBox>
                                <Row align="center" gap="sm">
                                    <Icon icon={WarningIcon} size="xs" />
                                    <Text
                                        variant="small"
                                        css={{ color: theme.colors.black }}>
                                        {t(
                                            'feature.backup.personal-backup-warning-line-1',
                                        )}
                                    </Text>
                                </Row>
                                <Row>
                                    <Text
                                        variant="small"
                                        css={{ color: theme.colors.black }}>
                                        {t(
                                            'feature.backup.personal-backup-warning-line-2',
                                        )}
                                    </Text>
                                </Row>
                            </WarningBox>
                            <Text weight="bold">
                                {t('feature.backup.personal-backup-words-tip')}
                            </Text>
                            <RecoverySeedWords words={words} readOnly />
                        </Column>
                    </Content>
                </Layout.Content>
                <Layout.Actions>
                    <Button
                        width="full"
                        onClick={handleFinish}
                        data-testid="confirm-button">
                        {t(
                            'feature.backup.personal-backup-button-primary-text',
                        )}
                    </Button>
                </Layout.Actions>
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled('div', {})

const IconWrapper = styled('div', {
    alignItems: 'center',
    borderRadius: '50%',
    display: 'flex',
    fediGradient: 'sky-banner',
    justifyContent: 'center',
    padding: theme.spacing.md,
})

const WarningBox = styled('div', {
    alignItems: 'center',
    background: theme.colors.orange100,
    borderRadius: 6,
    display: 'flex',
    flexDirection: 'column',
    padding: theme.spacing.md,
    textAlign: 'center',
    width: '100%',
})

export default PersonalBackupPage
