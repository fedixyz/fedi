import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useSelectCommunityChats } from '@fedi/common/hooks/matrix'
import { InjectionMessageResponseMap } from '@fedi/injections/src/types'

import { styled, theme } from '../../../styles'
import { Avatar } from '../../Avatar'
import { Button } from '../../Button'
import { ChatAvatar } from '../../Chat/ChatAvatar'
import { Dialog } from '../../Dialog'
import { Column, Row } from '../../Flex'
import { Icon } from '../../Icon'
import { Input } from '../../Input'
import { Switch } from '../../Switch'
import { Text } from '../../Text'

interface Props {
    open: boolean
    onConfirm(
        res: InjectionMessageResponseMap['fedi_selectPublicChats']['response'],
    ): void
}

export const SelectPublicChats: React.FC<Props> = ({ open, onConfirm }) => {
    const { t } = useTranslation()
    const {
        handleCreateGroup,
        isCreatingGroup,
        groupName,
        setGroupName,
        broadcastOnly,
        setBroadcastOnly,
        isPublic,
        handlePublicChange,
        allowKnocking,
        handleAllowKnockingChange,
        shouldShowAllowKnockingToggle,
        errorMessage,
        selectedChats,
        isCreatingNewGroup,
        eligibleChats,
        toggleSelectedChat,
        handleAccept,
        handleClose,
        startNewGroup,
        cancelNewGroup,
    } = useSelectCommunityChats({
        onAccept: onConfirm,
        // Web reports both accept and close through the same onConfirm
        // callback (empty array signals close), so onOpenChange is unused.
        onOpenChange: () => {},
    })

    const content = useMemo(() => {
        if (isCreatingNewGroup) {
            return (
                <>
                    <Avatar
                        id={''}
                        src=""
                        name={groupName}
                        icon={broadcastOnly ? 'SpeakerPhone' : 'SocialPeople'}
                        size="md"
                    />
                    <Column gap="xs" fullWidth>
                        <Input
                            onChange={e => setGroupName(e.target.value)}
                            value={groupName}
                            maxLength={30}
                            placeholder={`${t('feature.chat.group-name')}`}
                        />
                        {errorMessage && (
                            <Text
                                variant="small"
                                css={{
                                    color: theme.colors.red,
                                    textAlign: 'left',
                                }}>
                                {errorMessage}
                            </Text>
                        )}
                    </Column>
                    <Row align="center" justify="between" fullWidth>
                        <Text>{t('feature.chat.broadcast-only')}</Text>
                        <Switch
                            checked={broadcastOnly}
                            onCheckedChange={setBroadcastOnly}
                        />
                    </Row>
                    <Column gap="sm">
                        {shouldShowAllowKnockingToggle && (
                            <Row align="center" justify="between" fullWidth>
                                <Text>
                                    {t('feature.chat.allow-join-requests')}
                                </Text>
                                <Switch
                                    checked={allowKnocking}
                                    onCheckedChange={handleAllowKnockingChange}
                                />
                            </Row>
                        )}
                        <Row align="center" justify="between" fullWidth>
                            <Text>{t('words.public')}</Text>
                            <Switch
                                checked={isPublic}
                                onCheckedChange={handlePublicChange}
                            />
                        </Row>
                        {isPublic && (
                            <Text
                                variant="small"
                                css={{
                                    color: theme.colors.red,
                                    textAlign: 'left',
                                }}>
                                {t('feature.chat.public-group-warning')}
                            </Text>
                        )}
                    </Column>
                </>
            )
        }

        if (eligibleChats.length === 0) {
            return (
                <>
                    <Icon icon="SearchNoResult" size="lg" />

                    <Text variant="h2">
                        {t('feature.chat.no-public-chats-yet')}
                    </Text>

                    <Text variant="caption">
                        {t('feature.chat.create-or-join-public-chat')}
                    </Text>
                </>
            )
        }

        return (
            <>
                {eligibleChats.map(chat => (
                    <ChatRow
                        key={chat.id}
                        align="center"
                        gap="md"
                        fullWidth
                        onClick={() => toggleSelectedChat(chat.id)}>
                        <ChatAvatar room={chat} size="sm" />
                        <Text
                            weight="bold"
                            variant="caption"
                            css={{ flex: 1, textAlign: 'left' }}>
                            {chat.name}
                        </Text>
                        {selectedChats.includes(chat.id) ? (
                            <Icon icon="CheckboxChecked" size="sm" />
                        ) : (
                            <Icon icon="CheckboxUnchecked" size="sm" />
                        )}
                    </ChatRow>
                ))}
            </>
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        isCreatingNewGroup,
        selectedChats,
        broadcastOnly,
        eligibleChats,
        t,
        groupName,
        toggleSelectedChat,
        errorMessage,
        isPublic,
        handlePublicChange,
        allowKnocking,
        handleAllowKnockingChange,
        shouldShowAllowKnockingToggle,
        setBroadcastOnly,
        setGroupName,
    ])

    return (
        <Dialog
            open={open}
            onOpenChange={handleClose}
            type="tray"
            title={t('feature.chat.add-community-chat')}
            description={t('feature.chat.community-chat-description')}>
            <Container aria-label="select public chats dialog empty">
                <Body>{content}</Body>

                <Footer>
                    {isCreatingNewGroup ? (
                        <ButtonWrapper>
                            <Button
                                width="full"
                                variant="outline"
                                onClick={cancelNewGroup}>
                                {t('words.cancel')}
                            </Button>
                            <Button
                                width="full"
                                onClick={handleCreateGroup}
                                disabled={
                                    !groupName ||
                                    isCreatingGroup ||
                                    !!errorMessage
                                }>
                                {t('phrases.save-changes')}
                            </Button>
                        </ButtonWrapper>
                    ) : (
                        <ButtonWrapper>
                            <Button
                                width="full"
                                variant="outline"
                                onClick={startNewGroup}>
                                {t('feature.chat.new-group')}
                            </Button>
                            <Button onClick={handleAccept} width="full">
                                {t('words.continue')}
                            </Button>
                        </ButtonWrapper>
                    )}
                </Footer>
            </Container>
        </Dialog>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    height: '50dvh',
    maxHeight: 400,
    justifyContent: 'space-between',
    width: '100%',
})

const Body = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: 10,
    justifyContent: 'flex-start',
    padding: '20px 0',
    textAlign: 'center',
    overflowY: 'auto',
    width: '100%',
    zIndex: 10,
})

const ChatRow = styled(Row, {
    width: '100%',
})

const Footer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    height: 100,
    gap: 10,
    justifyContent: 'flex-end',
})

const ButtonWrapper = styled('div', {
    display: 'flex',
    gap: 10,
    width: '100%',
})
