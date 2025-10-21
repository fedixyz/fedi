import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import {
    selectLastSelectedCommunityChats,
    selectLastSelectedCommunity,
} from '@fedi/common/redux'
import { selectVisibleCommunityMods } from '@fedi/common/redux/mod'
import { getFederationPinnedMessage } from '@fedi/common/utils/FederationUtils'

import AnalyticsConsentModal from '../components/AnalyticsConsentModal'
import { DefaultRoomPreview } from '../components/Chat/DefaultRoomPreview'
import { ContentBlock } from '../components/ContentBlock'
import { DisplayNameModal } from '../components/DisplayNameModal'
import { FediModTiles } from '../components/FediModTiles'
import PinnedMessage from '../components/Home/PinnedMessage'
import { InstallBanner } from '../components/InstallBanner'
import * as Layout from '../components/Layout'
import SurveyModal from '../components/SurveyModal'
import { Text } from '../components/Text'
import {
    useAppSelector,
    useDeviceQuery,
    useInstallPromptContext,
    useShowInstallPromptBanner,
} from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'

function HomePage() {
    const { t } = useTranslation()
    const deferredPrompt = useInstallPromptContext()
    const { isIOS } = useDeviceQuery()
    const { showInstallBanner, handleOnDismiss } = useShowInstallPromptBanner()

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache(fedimint)

    const handleOnInstall = async () => {
        await deferredPrompt?.prompt()
    }

    const selectedCommunity = useAppSelector(selectLastSelectedCommunity)
    const selectedCommunityMods = useAppSelector(selectVisibleCommunityMods)
    const selectedCommunityChats = useAppSelector(s =>
        selectLastSelectedCommunityChats(s),
    )
    const pinnedMessage = getFederationPinnedMessage(
        selectedCommunity?.meta || {},
    )

    // Get rates from cache
    useEffect(() => {
        syncCurrencyRatesAndCache()
    }, [syncCurrencyRatesAndCache])

    // TODO: handle if we can't join fedi global community?
    if (!selectedCommunity) return null

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Content>
                    <Content>
                        {pinnedMessage && (
                            <PinnedMessage pinnedMessage={pinnedMessage} />
                        )}

                        {selectedCommunity &&
                            selectedCommunityChats.length > 0 && (
                                <Section>
                                    <Title weight="bold">
                                        {t('feature.home.community-news-title')}
                                    </Title>

                                    <NewsContainer>
                                        {selectedCommunityChats.map(room => (
                                            <DefaultRoomPreview
                                                room={room}
                                                federationOrCommunity={
                                                    selectedCommunity
                                                }
                                                key={`default-chat-${room.id}`}
                                            />
                                        ))}
                                    </NewsContainer>
                                </Section>
                            )}

                        <Section>
                            <Title weight="bold">
                                {t('feature.home.community-mods-title')}
                            </Title>
                            <SubTitle variant="caption">
                                {t('feature.home.community-services-selected')}
                            </SubTitle>
                            <ErrorBoundary fallback={null}>
                                <FediModTiles mods={selectedCommunityMods} />
                            </ErrorBoundary>
                        </Section>
                    </Content>
                </Layout.Content>

                {showInstallBanner && (
                    <InstallBanner
                        title={t('feature.home.pwa-install-banner-title')}
                        description={t(
                            'feature.home.pwa-install-banner-description',
                        )}
                        buttonLabel={t(
                            'feature.home.pwa-install-banner-button-label',
                        )}
                        onInstall={
                            isIOS
                                ? () =>
                                      window.open(
                                          'https://support.fedi.xyz/hc/en-us/articles/27283843087634',
                                          '_blank',
                                      )
                                : handleOnInstall
                        }
                        onClose={handleOnDismiss}
                    />
                )}
            </Layout.Root>

            {/* TODO: re-enable survey modal */}
            <SurveyModal />

            <DisplayNameModal />
            <AnalyticsConsentModal />
        </ContentBlock>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,

    '@sm': {
        marginTop: 12,
    },
})

const Section = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
})

const Title = styled(Text, {
    padding: '4px 0',
    fontSize: '20px!important',
})

const SubTitle = styled(Text, {
    color: theme.colors.darkGrey,
})

const NewsContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
})

export default HomePage
