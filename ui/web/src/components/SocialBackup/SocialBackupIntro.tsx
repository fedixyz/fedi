import Image from 'next/image'
import React from 'react'
import { useTranslation } from 'react-i18next'

import SocialRecoveryIcon from '@fedi/common/assets/images/social-recovery.png'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import * as Layout from '../Layout'
import { Text } from '../Text'

interface Props {
    next(): void
}

export const SocialBackupIntro: React.FC<Props> = ({ next }) => {
    const { t } = useTranslation()
    return (
        <>
            <Layout.Header back>
                <Layout.Title subheader>
                    {t('feature.backup.social-backup')}
                </Layout.Title>
            </Layout.Header>

            <Layout.Content>
                <Content>
                    <IconContainer>
                        <Image
                            src={SocialRecoveryIcon}
                            alt="Social Recovery Icon"
                            width="60"
                            height="60"
                        />
                    </IconContainer>
                    <Text center variant="h2" weight="bold">
                        {t('feature.backup.social-backup')}
                    </Text>
                    <Text center css={{ color: theme.colors.darkGrey }}>
                        {t('feature.backup.start-social-backup-desc')}
                    </Text>
                    <Text center css={{ color: theme.colors.darkGrey }}>
                        {t('feature.backup.start-social-backup-warning')}
                    </Text>
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Button width="full" onClick={next}>
                    {t('words.start')}
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
