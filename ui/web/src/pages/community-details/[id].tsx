import { useRouter } from 'next/router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import RoomIcon from '@fedi/common/assets/svgs/room.svg'
import { useLeaveCommunity } from '@fedi/common/hooks/leave'
import { useToast } from '@fedi/common/hooks/toast'
import { selectCommunity, selectDefaultChats } from '@fedi/common/redux'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
} from '@fedi/common/utils/FederationUtils'

import { Button } from '../../components/Button'
import { DefaultRoomPreview } from '../../components/Chat/DefaultRoomPreview'
import { ContentBlock } from '../../components/ContentBlock'
import { Dialog } from '../../components/Dialog'
import { FederationAvatar } from '../../components/FederationAvatar'
import { Column, Row } from '../../components/Flex'
import { Icon } from '../../components/Icon'
import * as Layout from '../../components/Layout'
import { Text } from '../../components/Text'
import { useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled, theme } from '../../styles'

function CommunityDetails() {
    const { query, isReady, push } = useRouter()

    const [wantsToLeaveCommunity, setWantsToLeaveCommunity] = useState(false)

    const id = (query.id as string | undefined) ?? ''
    const community = useAppSelector(s => selectCommunity(s, id))
    const chats = useAppSelector(s => selectDefaultChats(s, id))
    const toast = useToast()

    const { t } = useTranslation()
    const { canLeaveCommunity, handleLeave, isLeaving } = useLeaveCommunity({
        t,
        communityId: id,
        fedimint,
    })

    const handleClose = () => {
        setWantsToLeaveCommunity(false)
    }

    const onLeave = () => {
        handleLeave()
            .then(() => push('/home'))
            .catch(e => toast.error(t, e))
    }

    if (!community || !isReady || !id) return null

    const welcomeMessage = getFederationWelcomeMessage(community.meta)
    const tosUrl = getFederationTosUrl(community.meta)

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back>
                    <Layout.Title subheader>
                        {t('feature.communities.community-details')}
                    </Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <Column gap="lg" grow>
                        <Row align="center" gap="lg">
                            <FederationAvatar
                                federation={community}
                                size="lg"
                                css={{ flexShrink: 0 }}
                            />
                            <Text variant="h2">{community.name}</Text>
                        </Row>
                        {chats.length > 0 && (
                            <Column gap="sm" fullWidth>
                                <Text variant="h2" weight="bold">
                                    {t('feature.home.community-news-title')}
                                </Text>
                                {chats.map(room => (
                                    <DefaultRoomPreview
                                        room={room}
                                        key={`default-chat-${room.id}`}
                                    />
                                ))}
                            </Column>
                        )}
                        <Text>{welcomeMessage}</Text>
                    </Column>
                    <Actions>
                        {tosUrl && (
                            <Button
                                variant="secondary"
                                as="a"
                                href={tosUrl}
                                target="_blank">
                                {t(
                                    'feature.communities.community-terms-and-conditions',
                                )}
                            </Button>
                        )}
                        {canLeaveCommunity && (
                            <Button
                                variant="tertiary"
                                css={{ textDecoration: 'underline' }}
                                onClick={() => setWantsToLeaveCommunity(true)}>
                                {t('feature.communities.leave-community')}
                            </Button>
                        )}
                    </Actions>
                </Layout.Content>
            </Layout.Root>

            <Dialog
                open={wantsToLeaveCommunity}
                onOpenChange={handleClose}
                mobileDismiss="overlay">
                <Column gap="lg" align="center">
                    <IconContainer>
                        <Icon
                            icon={RoomIcon}
                            size={64}
                            color={theme.colors.red as unknown as string}
                        />
                    </IconContainer>
                    <Text variant="h2" weight="medium">
                        {t('feature.communities.leave-community-title')}
                    </Text>
                    <Text center>
                        {t('feature.communities.leave-community-description')}
                    </Text>
                    <LeaveActions>
                        <Button
                            onClick={onLeave}
                            loading={isLeaving}
                            variant="outline">
                            {t('feature.communities.confirm-exit')}
                        </Button>
                        <Button onClick={handleClose}>
                            {t('words.cancel')}
                        </Button>
                    </LeaveActions>
                </Column>
            </Dialog>
        </ContentBlock>
    )
}

const LeaveActions = styled('div', {
    display: 'flex',
    gap: 16,
    width: '100%',

    '& > button': {
        flex: 1,
    },
})

const IconContainer = styled('div', {
    borderRadius: 1024,
    backgroundColor: theme.colors.red100,
    width: 120,
    height: 120,
    aspectRatio: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
})

const Actions = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 32,

    '@sm': {
        paddingLeft: 16,
        paddingRight: 16,
    },
})

export default CommunityDetails
