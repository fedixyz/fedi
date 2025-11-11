import { useNavigation } from '@react-navigation/native'
import { Text, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { useUpdatingRef } from '@fedi/common/hooks/util'
import { selectMatrixRooms } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { reset } from '../../../state/navigation'
import { AvatarSize } from '../../ui/Avatar'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column, Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import ChatAvatar from '../chat/ChatAvatar'

interface Props {
    onReject: (err: Error) => void
    onAccept: (chatIds: string[]) => void
    open: boolean
    onOpenChange: (open: boolean) => void
}

export const SelectPublicChatsOverlay: React.FC<Props> = ({
    onAccept,
    open,
    onOpenChange,
}) => {
    const [selectedChats, setSelectedChats] = useState<Array<string>>([])
    const chats = useAppSelector(selectMatrixRooms)
    const onAcceptRef = useUpdatingRef(onAccept)
    const publicChats = chats.filter(c => c.isPublic)
    const navigation = useNavigation()

    const { theme } = useTheme()
    const { t } = useTranslation()

    const toggleSelectedChat = (chatId: string) => {
        if (selectedChats.includes(chatId)) {
            setSelectedChats(selectedChats.filter(c => c !== chatId))
        } else {
            setSelectedChats([...selectedChats, chatId])
        }
    }

    const handleAccept = async () => {
        onAcceptRef.current(selectedChats)
        onOpenChange(false)
    }

    const handleReject = () => {
        onAcceptRef.current([])
        onOpenChange(false)
    }

    const handleCreateGroup = () => {
        navigation.dispatch(
            reset('CreateGroup', {
                defaultGroup: true,
            }),
        )
    }

    return (
        <CustomOverlay
            show={open}
            onBackdropPress={handleReject}
            contents={{
                title: t('feature.chat.add-community-chat'),
                body: (
                    <ScrollView>
                        {publicChats.length === 0 ? (
                            <Column
                                gap="md"
                                align="center"
                                style={{ paddingVertical: theme.spacing.xl }}>
                                <SvgImage
                                    name="SearchNoResult"
                                    color={theme.colors.grey}
                                    size={48}
                                />
                                <Text
                                    color={theme.colors.darkGrey}
                                    h2
                                    center
                                    medium>
                                    {t('feature.chat.no-public-chats-yet')}
                                </Text>
                                <Text color={theme.colors.grey} caption center>
                                    {t(
                                        'feature.chat.create-or-join-public-chat',
                                    )}
                                </Text>
                            </Column>
                        ) : (
                            <Column gap="md">
                                <Text caption center>
                                    {t(
                                        'feature.chat.community-chat-description',
                                    )}
                                </Text>
                                {publicChats.map(chat => (
                                    <Pressable
                                        key={`community-chat-${chat.id}`}
                                        onPress={() =>
                                            toggleSelectedChat(chat.id)
                                        }>
                                        <Row align="center" gap="md">
                                            <ChatAvatar
                                                size={AvatarSize.sm}
                                                room={chat}
                                            />
                                            <Text
                                                medium
                                                style={{ flex: 1 }}
                                                ellipsizeMode="tail"
                                                numberOfLines={1}>
                                                {chat.name}
                                            </Text>
                                            <SvgImage
                                                name={
                                                    selectedChats.includes(
                                                        chat.id,
                                                    )
                                                        ? 'CheckboxChecked'
                                                        : 'CheckboxUnchecked'
                                                }
                                            />
                                        </Row>
                                    </Pressable>
                                ))}
                            </Column>
                        )}
                    </ScrollView>
                ),
                buttons:
                    publicChats.length > 0
                        ? [
                              {
                                  text: t('feature.chat.new-group'),
                                  onPress: handleCreateGroup,
                              },
                              {
                                  primary: true,
                                  text: t('words.continue'),
                                  onPress: handleAccept,
                              },
                          ]
                        : [
                              {
                                  text: t('words.skip'),
                                  onPress: handleAccept,
                              },
                              {
                                  primary: true,
                                  text: t('feature.chat.new-group'),
                                  onPress: handleCreateGroup,
                              },
                          ],
            }}
        />
    )
}
