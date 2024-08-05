import React from 'react'
import { useTranslation } from 'react-i18next'

import { styled } from '../styles'
import { Button } from './Button'
import FloatingEmoji from './FloatingEmoji'
import * as Layout from './Layout'
import { Text } from './Text'

type UpgradeItem = {
    emoji: string
    title: string
    subtitle: string
}

export const UpgradeChat: React.FC = () => {
    const { t } = useTranslation()
    const upgradeItems: UpgradeItem[] = [
        {
            emoji: '🔆',
            title: t('feature.chat.upgrade-chat-item-title-1'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-1'),
        },
        {
            emoji: '👤',
            title: t('feature.chat.upgrade-chat-item-title-2'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-2'),
        },
        {
            emoji: '🔒',
            title: t('feature.chat.upgrade-chat-item-title-3'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-3'),
        },
        {
            emoji: '💸',
            title: t('feature.chat.upgrade-chat-item-title-4'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-4'),
        },
        {
            emoji: '🎉',
            title: t('feature.chat.upgrade-chat-item-title-5'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-5'),
        },
    ]

    const renderItem = (item: UpgradeItem, index: number) => (
        <ItemRow key={`ui-${index}`}>
            <FloatingEmoji emoji={item.emoji} size={20} />
            <ItemText>
                <Text weight="medium">{item.title}</Text>
                <Text variant="small">{item.subtitle}</Text>
            </ItemText>
        </ItemRow>
    )

    return (
        <Layout.Root>
            <Layout.Content centered>
                <Content>
                    <FloatingEmoji emoji={'🌍'} size={32} />
                    <Text variant="h2" weight="medium">
                        {t('feature.chat.upgrade-chat')}
                    </Text>
                    <Text weight="medium">
                        {t('feature.chat.upgrade-chat-guidance')}
                    </Text>
                    <UpgradeItemsContainer>
                        {upgradeItems.map(renderItem)}
                    </UpgradeItemsContainer>
                    <Button
                        width="full"
                        href="/onboarding/username"
                        css={{ maxWidth: 320 }}>
                        {t('words.continue')}
                    </Button>
                </Content>
            </Layout.Content>
        </Layout.Root>
    )
}

const Content = styled('div', {
    maxWidth: 320,
    gap: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    alignSelf: 'center',
    textAlign: 'center',
})

const UpgradeItemsContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 16,
})

const ItemRow = styled('div', {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
})

const ItemText = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
})
