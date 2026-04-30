import { useRouter } from 'next/router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCreatedCommunities } from '@fedi/common/hooks/federation'
import { useLeaveCommunity } from '@fedi/common/hooks/leave'
import { useToast } from '@fedi/common/hooks/toast'
import {
    closeBrowser,
    selectCommunity,
    selectDefaultChats,
    selectCurrentUrl,
    setCurrentUrl,
} from '@fedi/common/redux'
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
import { FediBrowser } from '../../components/FediBrowser'
import { Column, Row } from '../../components/Flex'
import { Icon } from '../../components/Icon'
import * as Layout from '../../components/Layout'
import { Text } from '../../components/Text'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

function CommunityDetails() {
    const { t } = useTranslation()
    const { query, isReady, push } = useRouter()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const id = (query.id as string | undefined) ?? ''

    const [wantsToLeaveCommunity, setWantsToLeaveCommunity] = useState(false)
    const [invitingCommunityId, setInvitingCommunityId] = useState('')
    const currentUrl = useAppSelector(selectCurrentUrl)

    const community = useAppSelector(s => selectCommunity(s, id))
    const chats = useAppSelector(s => selectDefaultChats(s, id))
    const { canEditCommunity, editCommunityUrl } = useCreatedCommunities(id)
    const { canLeaveCommunity, handleLeave, isLeaving } = useLeaveCommunity(id)

    const handleClose = () => {
        setWantsToLeaveCommunity(false)
    }

    const onLeave = () => {
        handleLeave()
            .then(() => push('/home'))
            .catch(e => toast.error(t, e))
    }

    const handleEditCommunity = () => {
        if (!editCommunityUrl) return
        const url = editCommunityUrl.toString()

        dispatch(setCurrentUrl({ url }))
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
                        <Row gap="sm">
                            {canEditCommunity && (
                                <Icon
                                    icon="Edit"
                                    size="sm"
                                    onClick={handleEditCommunity}
                                />
                            )}
                            {showInviteCode && (
                                <Icon
                                    icon="Qr"
                                    size="sm"
                                    onClick={() =>
                                        setInvitingCommunityId(community.id)
                                    }
                                />
                            )}
                        </Row>
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
                </Layout.Content>
                <Layout.Actions>
                    <Column gap="xs" fullWidth>
                        {tosUrl && (
                            <Button
                                width="full"
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
                    </Column>
                </Layout.Actions>
            </Layout.Root>

            {!!currentUrl && (
                <FediBrowser
                    url={currentUrl}
                    onClose={() => dispatch(closeBrowser())}
                />
            )}

            <Dialog
                open={wantsToLeaveCommunity}
                onOpenChange={handleClose}
                type="tray">
                <Column gap="lg" align="center">
                    <IconContainer>
                        <Icon
                            icon="Room"
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

export default CommunityDetails
