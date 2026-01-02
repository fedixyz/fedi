import { useRouter } from 'next/router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { useLeaveFederation } from '@fedi/common/hooks/leave'
import { useToast } from '@fedi/common/hooks/toast'
import { selectDefaultChats, selectLoadedFederation } from '@fedi/common/redux'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
} from '@fedi/common/utils/FederationUtils'

import { Button } from '../../components/Button'
import { DefaultRoomPreview } from '../../components/Chat/DefaultRoomPreview'
import { ContentBlock } from '../../components/ContentBlock'
import { FederationAvatar } from '../../components/FederationAvatar'
import FederationCountdownDialog from '../../components/FederationDetails/FederationCountdownDialog'
import FederationDetailStats from '../../components/FederationDetails/FederationDetailStats'
import FederationPopupCountdown from '../../components/FederationDetails/FederationPopupCountdown'
import { FederationStatus } from '../../components/FederationDetails/FederationStatus'
import * as Layout from '../../components/Layout'
import { ShadowScroller } from '../../components/ShadowScroller'
import { Text } from '../../components/Text'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

function FederationDetails() {
    const { query, isReady, push } = useRouter()
    const { t } = useTranslation()

    const [showPopupInfo, setShowPopupInfo] = useState(false)
    const [isLeavingFederation, setIsLeavingFederation] = useState(false)

    const id = (query.id as string | undefined) ?? ''
    const federation = useAppSelector(s => selectLoadedFederation(s, id))
    const federationChats = useAppSelector(s => selectDefaultChats(s, id))
    const popupInfo = usePopupFederationInfo(federation?.meta || {})
    const toast = useToast()

    const { handleLeaveFederation, validateCanLeaveFederation } =
        useLeaveFederation({
            t,
            federationId: federation?.id || '',
        })

    const handleLeave = () => {
        if (!federation) return

        const canLeave = validateCanLeaveFederation(federation)

        if (canLeave) {
            setIsLeavingFederation(true)
            handleLeaveFederation()
                .then(() => push('/federations'))
                .catch(e => toast.error(t, e))
                .finally(() => setIsLeavingFederation(false))
        }
    }

    if (!federation || !isReady || !id) return null

    const welcomeMessage = getFederationWelcomeMessage(federation.meta)
    const tosUrl = getFederationTosUrl(federation.meta)

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back>
                    <Layout.Title subheader>
                        {t('feature.federations.federation-details')}
                    </Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <Content>
                        <HeaderContent>
                            <FederationHeader>
                                <FederationAvatar
                                    federation={federation}
                                    size="lg"
                                    css={{ flexShrink: 0 }}
                                />
                                <Text variant="h2">{federation.name}</Text>
                            </FederationHeader>
                            <div onClick={() => setShowPopupInfo(true)}>
                                <FederationPopupCountdown
                                    federation={federation}
                                />
                            </div>
                            <FederationStatus federationId={id} />
                            <FederationDetailStats federation={federation} />
                        </HeaderContent>
                        <ScrollableContent>
                            {federationChats.length > 0 && (
                                <ChatsContainer>
                                    <Text variant="h2" weight="bold">
                                        {t('feature.chat.federation-news')}
                                    </Text>
                                    {federationChats.map(room => (
                                        <DefaultRoomPreview
                                            room={room}
                                            key={`default-chat-${room.id}`}
                                        />
                                    ))}
                                </ChatsContainer>
                            )}
                            {welcomeMessage && <Text>{welcomeMessage}</Text>}
                        </ScrollableContent>
                    </Content>
                    {(tosUrl || popupInfo?.ended) && (
                        <Actions>
                            {popupInfo?.ended && (
                                <Button
                                    onClick={handleLeave}
                                    loading={isLeavingFederation}>
                                    {t('feature.federations.leave-federation')}
                                </Button>
                            )}
                            {tosUrl && (
                                <Button
                                    variant="secondary"
                                    as="a"
                                    href={tosUrl}
                                    target="_blank">
                                    {t(
                                        'feature.federations.federation-terms-and-conditions',
                                    )}
                                </Button>
                            )}
                        </Actions>
                    )}
                </Layout.Content>
            </Layout.Root>
            <FederationCountdownDialog
                open={showPopupInfo}
                onOpenChange={setShowPopupInfo}
                federation={federation}
            />
        </ContentBlock>
    )
}

const FederationHeader = styled('div', {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
})

const HeaderContent = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const ScrollableContent = styled(ShadowScroller, {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    flex: 1,
    overflowY: 'auto',
})

const Actions = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    paddingTop: 16,
    paddingBottom: 16,

    '@sm': {
        paddingLeft: 16,
        paddingRight: 16,
    },
})

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    flex: 1,
})

const ChatsContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
})

export default FederationDetails
