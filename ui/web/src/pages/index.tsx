import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectFederations } from '@fedi/common/redux'

import { BitcoinWallet } from '../components/BitcoinWallet'
import { ContentBlock } from '../components/ContentBlock'
import { FediModTiles } from '../components/FediModTiles'
import * as Layout from '../components/Layout'
import PublicFederations from '../components/PublicFederations'
import { useAppSelector } from '../hooks'
import { styled } from '../styles'

function HomePage() {
    const { t } = useTranslation()
    const federations = useAppSelector(selectFederations)

    const hasFederations = federations.length > 0

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header>
                    <Layout.Title>{t('words.home')}</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    {hasFederations ? (
                        <ContentInner>
                            <BitcoinWallet />
                            <ErrorBoundary fallback={null}>
                                <FediModTiles />
                            </ErrorBoundary>
                        </ContentInner>
                    ) : (
                        <PublicFederations />
                    )}
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

const ContentInner = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

export default HomePage
