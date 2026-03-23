import { useTranslation } from 'react-i18next'

import { ContentBlock } from '../components/ContentBlock'
import { FediModTiles } from '../components/FediModTiles'
import * as Layout from '../components/Layout'
import { styled, theme } from '../styles'

export default function ModsPage() {
    const { t } = useTranslation()

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.PageHeader title={t('phrases.mini-apps')} />
                <Layout.Content fullWidth>
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
    gap: theme.spacing.md,
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.md,
    textAlign: 'center',
})
