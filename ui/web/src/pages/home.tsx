import { useRouter } from 'next/router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import {
    selectLastSelectedCommunityChats,
    selectLastSelectedCommunity,
    selectCommunities,
} from '@fedi/common/redux'
import { selectVisibleCommunityMods } from '@fedi/common/redux/mod'
import { getFederationPinnedMessage } from '@fedi/common/utils/FederationUtils'

import AnalyticsConsentModal from '../components/AnalyticsConsentModal'
import { DefaultRoomPreview } from '../components/Chat/DefaultRoomPreview'
import CommunitiesOverlay from '../components/CommunitiesOverlay'
import { ContentBlock } from '../components/ContentBlock'
import { FediModTiles } from '../components/FediModTiles'
import PinnedMessage from '../components/Home/PinnedMessage'
import * as Layout from '../components/Layout'
import SurveyModal from '../components/SurveyModal'
import { Text } from '../components/Text'
import { onboardingCommunitiesRoute } from '../constants/routes'
import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'

function HomePage() {
    const { t } = useTranslation()
    const { push } = useRouter()

    const [showCommunities, setShowCommunities] = useState(false)

    const communities = useAppSelector(selectCommunities)
    const selectedCommunity = useAppSelector(selectLastSelectedCommunity)
    const selectedCommunityMods = useAppSelector(selectVisibleCommunityMods)
    const selectedCommunityChats = useAppSelector(s =>
        selectLastSelectedCommunityChats(s),
    )
    const pinnedMessage = getFederationPinnedMessage(
        selectedCommunity?.meta || {},
    )

    // TODO: handle if we can't join fedi global community?
    if (!selectedCommunity) return null

    const isCommunityDeleted = selectedCommunity?.status === 'deleted'

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.PageHeader
                    title={t('words.spaces')}
                    onAddPress={() => push(onboardingCommunitiesRoute)}
                    onMenuPress={
                        communities.length >= 2
                            ? () => setShowCommunities(true)
                            : undefined
                    }
                    selectedCommunity={selectedCommunity}
                />
                <Layout.Content>
                    {/* We only want to show this content if the community is not deleted */}
                    {!isCommunityDeleted && (
                        <Content>
                            {pinnedMessage && (
                                <PinnedMessage pinnedMessage={pinnedMessage} />
                            )}

                            {selectedCommunity &&
                                selectedCommunityChats.length > 0 && (
                                    <Section>
                                        <Title weight="bold">
                                            {t(
                                                'feature.home.community-news-title',
                                            )}
                                        </Title>

                                        <NewsContainer>
                                            {selectedCommunityChats.map(
                                                room => (
                                                    <DefaultRoomPreview
                                                        room={room}
                                                        key={`default-chat-${room.id}`}
                                                    />
                                                ),
                                            )}
                                        </NewsContainer>
                                    </Section>
                                )}

                            <Section>
                                <Title weight="bold">
                                    {t('feature.home.community-mods-title')}
                                </Title>
                                <SubTitle variant="caption">
                                    {t(
                                        'feature.home.community-services-selected',
                                    )}
                                </SubTitle>
                                <ErrorBoundary fallback={null}>
                                    <FediModTiles
                                        mods={selectedCommunityMods}
                                    />
                                </ErrorBoundary>
                            </Section>
                        </Content>
                    )}
                </Layout.Content>
            </Layout.Root>

            <SurveyModal />

            <AnalyticsConsentModal />

            <CommunitiesOverlay
                open={showCommunities}
                onOpenChange={setShowCommunities}
            />
        </ContentBlock>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
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
