import { useRouter } from 'next/router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import QrCodeIcon from '@fedi/common/assets/svgs/qr.svg'
import RoomIcon from '@fedi/common/assets/svgs/room.svg'
import { useLeaveCommunity } from '@fedi/common/hooks/leave'
import { useToast } from '@fedi/common/hooks/toast'
import { selectCommunity, selectDefaultChats } from '@fedi/common/redux'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    shouldShowInviteCode,
} from '@fedi/common/utils/FederationUtils'

import { Button } from '../../components/Button'
import { DefaultRoomPreview } from '../../components/Chat/DefaultRoomPreview'
import { CommunityInviteDialog } from '../../components/CommunityInviteDialog'
import { ContentBlock } from '../../components/ContentBlock'
import { Dialog } from '../../components/Dialog'
import { FederationAvatar } from '../../components/FederationAvatar'
import { Column, Row } from '../../components/Flex'
import { Icon } from '../../components/Icon'
import * as Layout from '../../components/Layout'
import { Text } from '../../components/Text'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

function CommunityDetails() {
    const { query, isReady, push } = useRouter()

    const [wantsToLeaveCommunity, setWantsToLeaveCommunity] = useState(false)
    const [invitingCommunityId, setInvitingCommunityId] = useState('')

    const id = (query.id as string | undefined) ?? ''
    const community = useAppSelector(s => selectCommunity(s, id))
    const chats = useAppSelector(s => selectDefaultChats(s, id))
    const toast = useToast()

    const { t } = useTranslation()
    const { canLeaveCommunity, handleLeave, isLeaving } = useLeaveCommunity(id)

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
    const showInviteCode = shouldShowInviteCode(community.meta)

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header
                    back
                    rightComponent={
                        showInviteCode ? (
                            <Icon
                                icon={QrCodeIcon}
                                size="sm"
                                onClick={() =>
                                    setInvitingCommunityId(community.id)
                                }
                            />
                        ) : undefined
                    }>
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
                type="tray">
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
                    <Column fullWidth gap="md">
                        <Button onClick={onLeave} loading={isLeaving}>
                            {t('words.confirm')}
                        </Button>
                        <Button onClick={handleClose} variant="outline">
                            {t('words.cancel')}
                        </Button>
                    </Column>
                </Column>
            </Dialog>

            <CommunityInviteDialog
                open={!!invitingCommunityId}
                communityId={invitingCommunityId}
                onClose={() => setInvitingCommunityId('')}
            />
        </ContentBlock>
    )
}

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
