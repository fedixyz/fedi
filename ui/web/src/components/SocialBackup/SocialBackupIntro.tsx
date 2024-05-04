import React from 'react'
import { useTranslation } from 'react-i18next'

import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'

import { styled } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'

interface Props {
    next(): void
}

export const SocialBackupIntro: React.FC<Props> = ({ next }) => {
    const { t } = useTranslation()
    return (
        <>
            <Layout.Header back="/settings/backup">
                <Layout.Title subheader>
                    {t('feature.backup.file-backup')}
                </Layout.Title>
            </Layout.Header>

            <Layout.Content>
                <Content>
                    <IconContainer>
                        <Icon icon={SocialPeopleIcon} size="lg" />
                    </IconContainer>
                    <Text variant="h2" weight="medium">
                        {t('feature.backup.social-backup')}
                    </Text>
                    <Text>
                        {t('feature.backup.start-social-backup-instructions')}
                    </Text>
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Button width="full" onClick={next}>
                    {t('words.next')}
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
    maxWidth: 340,
    gap: 16,
})

const IconContainer = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 180,
    aspectRatio: '1/1',
    borderRadius: '100%',
    holoGradient: '600',
})
