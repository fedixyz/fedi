import { useTranslation } from 'react-i18next'

import { ContentBlock } from '../components/ContentBlock'
import { FediModTiles } from '../components/FediModTiles'
import * as Layout from '../components/Layout'
import { styled } from '../styles'

export default function ModsPage() {
    const { t } = useTranslation()

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header>
                    <Layout.Title>{t('words.mods')}</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <Content>
                        <FediModTiles />
                    </Content>
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    justifyContent: 'flex-start',
    padding: 20,
    textAlign: 'center',
})
