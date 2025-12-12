import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import CheckboxChecked from '@fedi/common/assets/svgs/checkbox-checked.svg'
import CheckboxUnchecked from '@fedi/common/assets/svgs/checkbox-unchecked.svg'
import SearchNoresult from '@fedi/common/assets/svgs/search-no-result.svg'
import { selectMatrixRooms } from '@fedi/common/redux'
import { InjectionMessageResponseMap } from '@fedi/injections/src/types'

import { useAppSelector } from '../../../hooks'
import { styled } from '../../../styles'
import { Button } from '../../Button'
import { ChatAvatar } from '../../Chat/ChatAvatar'
import { Dialog } from '../../Dialog'
import { Row } from '../../Flex'
import { Icon } from '../../Icon'
import { Text } from '../../Text'

interface Props {
    open: boolean
    onConfirm(
        res: InjectionMessageResponseMap['fedi_selectPublicChats']['response'],
    ): void
}

export const SelectPublicChats: React.FC<Props> = ({ open, onConfirm }) => {
    const { t } = useTranslation()
    const chats = useAppSelector(selectMatrixRooms)
    const publicChats = chats.filter(c => c.isPublic)
    const [selectedChats, setSelectedChats] = useState<Array<string>>([])

    const toggleSelectedChat = (chatId: string) => {
        if (selectedChats.includes(chatId)) {
            setSelectedChats(selectedChats.filter(c => c !== chatId))
        } else {
            setSelectedChats([...selectedChats, chatId])
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={() => {}}
            mobileDismiss="overlay"
            disableClose
            disablePadding>
            {publicChats.length > 0 ? (
                <Container aria-label="select public chats dialog">
                    <Header>
                        <Text variant="body" weight="bold">
                            {t('feature.chat.add-community-chat')}
                        </Text>
                        <Text variant="caption">
                            {t('feature.chat.community-chat-description')}
                        </Text>
                    </Header>

                    <Body>
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
                                    <Icon icon={CheckboxChecked} size="sm" />
                                ) : (
                                    <Icon icon={CheckboxUnchecked} size="sm" />
                                )}
                            </ChatRow>
                        ))}
                    </Body>

                    <Footer>
                        <ButtonWrapper>
                            <Button
                                width="full"
                                onClick={() => onConfirm(selectedChats)}>
                                {t('words.continue')}
                            </Button>
                        </ButtonWrapper>
                    </Footer>
                </Container>
            ) : (
                <Container aria-label="select public chats dialog empty">
                    <Header>
                        <Text variant="body" weight="bold">
                            {t('feature.chat.add-community-chat')}
                        </Text>
                    </Header>

                    <Body>
                        <Icon icon={SearchNoresult} size="lg" />

                        <Text variant="h2">
                            {t('feature.chat.no-public-chats-yet')}
                        </Text>

                        <Text variant="caption">
                            {t('feature.chat.create-or-join-public-chat')}
                        </Text>
                    </Body>

                    <Footer>
                        <ButtonWrapper>
                            <Button
                                width="full"
                                variant="outline"
                                onClick={() => onConfirm(selectedChats)}>
                                {t('words.skip')}
                            </Button>
                        </ButtonWrapper>
                    </Footer>
                </Container>
            )}
        </Dialog>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    height: '50dvh',
    maxHeight: 400,
    justifyContent: 'space-between',
    padding: 20,
    width: '100%',
})

const Header = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    justifyContent: 'center',
    textAlign: 'center',
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
