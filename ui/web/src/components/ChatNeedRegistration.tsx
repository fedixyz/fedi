import Image from 'next/image'
import React from 'react'
import { useTranslation } from 'react-i18next'

import ChatIllustration from '@fedi/common/assets/images/illustration-chat.png'

import { styled } from '../styles'
import { Button } from './Button'
import * as Layout from './Layout'
import { Text } from './Text'

export const ChatNeedRegistration: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Layout.Root>
            <Layout.Content centered>
                <Content>
                    <Image
                        src={ChatIllustration}
                        alt=""
                        width={240}
                        height={240}
                    />
                    <Text variant="h2" weight="normal">
                        {t('feature.chat.need-registration-title')}
                    </Text>
                    <Text>
                        {t('feature.chat.need-registration-description')}
                    </Text>
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
