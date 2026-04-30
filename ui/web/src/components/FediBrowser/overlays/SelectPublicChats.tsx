import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCreateMatrixRoom } from '@fedi/common/hooks/matrix'
import { selectMatrixRooms } from '@fedi/common/redux'
import { InjectionMessageResponseMap } from '@fedi/injections/src/types'

import { useAppSelector } from '../../../hooks'
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
    const [selectedChats, setSelectedChats] = useState<Array<string>>([])
    const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)

    const onChatCreated = (roomId: string) => {
        if (selectedChats.includes(roomId)) return
        setSelectedChats([...selectedChats, roomId])
        setIsCreatingNewGroup(false)
    }

    const { t } = useTranslation()
    const {
        handleCreateGroup,
        isCreatingGroup,
        groupName,
        setGroupName,
        broadcastOnly,
        setBroadcastOnly,
        isPublic,
        errorMessage,
        reset: resetCreateMatrixRoom,
    } = useCreateMatrixRoom(t, onChatCreated, { isPublic: true })

    const chats = useAppSelector(selectMatrixRooms)

    const publicChats = chats.filter(c => c.isPublic)

    const toggleSelectedChat = useCallback(
        (chatId: string) => {
            if (selectedChats.includes(chatId)) {
                setSelectedChats(selectedChats.filter(c => c !== chatId))
            } else {
                setSelectedChats(prev => [...prev, chatId])
            }
        },
        [selectedChats],
    )

    const reset = () => {
        setSelectedChats([])
        setIsCreatingNewGroup(false)
    }

    const handleAccept = () => {
        onConfirm(selectedChats)
        reset()
    }

    const handleClose = () => {
        onConfirm([])
        reset()
    }

    const handleNewGroup = useCallback(() => {
        resetCreateMatrixRoom()
        setIsCreatingNewGroup(true)
    }, [resetCreateMatrixRoom])

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
                        <Row align="center" justify="between" fullWidth>
                            <Text>{t('words.public')}</Text>
                            <Switch checked={isPublic} disabled />
                        </Row>
                        <Text
                            variant="small"
                            css={{
                                color: theme.colors.grey,
                                textAlign: 'left',
                            }}>
                            {t('feature.chat.public-group-warning')}
                        </Text>
                    </Column>
                </>
            )
        }

        if (publicChats.length === 0) {
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
                {publicChats.map(chat => (
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
        publicChats,
        t,
        groupName,
        toggleSelectedChat,
        errorMessage,
        isPublic,
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
                                onClick={() => setIsCreatingNewGroup(false)}>
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
                                onClick={handleNewGroup}>
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
