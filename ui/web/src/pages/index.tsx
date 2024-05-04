import React from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'

import { BitcoinWallet } from '../components/BitcoinWallet'
import { ContentBlock } from '../components/ContentBlock'
import { FediModTiles } from '../components/FediModTiles'
import * as Layout from '../components/Layout'
import { styled } from '../styles'

function HomePage() {
    const { t } = useTranslation()

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header>
                    <Layout.Title>{t('words.home')}</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <ContentInner>
                        <BitcoinWallet />
                        <ErrorBoundary fallback={null}>
                            <FediModTiles />
                        </ErrorBoundary>
                    </ContentInner>
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
