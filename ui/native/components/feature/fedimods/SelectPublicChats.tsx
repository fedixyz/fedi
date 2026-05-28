import { Input, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { useSelectCommunityChats } from '@fedi/common/hooks/matrix'

import Avatar, { AvatarSize } from '../../ui/Avatar'
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
    const { t } = useTranslation()
    const { theme } = useTheme()
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
    } = useSelectCommunityChats({ onAccept, onOpenChange })

    const style = styles(theme)

    const content = useMemo(() => {
        if (isCreatingNewGroup) {
            return (
                <Column gap="lg" align="center" style={style.newGroupContainer}>
                    <Avatar
                        id={''}
                        icon={broadcastOnly ? 'SpeakerPhone' : 'SocialPeople'}
                        size={AvatarSize.md}
                    />
                    <Input
                        onChangeText={setGroupName}
                        value={groupName}
                        maxLength={30}
                        placeholder={`${t('feature.chat.group-name')}`}
                        returnKeyType="done"
                        containerStyle={style.textInputOuter}
                        inputContainerStyle={style.textInputInner}
                        autoCapitalize={'none'}
                        autoCorrect={false}
                        selectTextOnFocus
                        errorMessage={errorMessage ?? undefined}
                    />
                    <Row align="center" justify="between" fullWidth>
                        <Text>{t('feature.chat.broadcast-only')}</Text>
                        <Switch
                            value={broadcastOnly}
                            onValueChange={setBroadcastOnly}
                        />
                    </Row>
                    <Column gap="sm">
                        {shouldShowAllowKnockingToggle && (
                            <Row align="center" justify="between" fullWidth>
                                <Text>
                                    {t('feature.chat.allow-join-requests')}
                                </Text>
                                <Switch
                                    value={allowKnocking}
                                    onValueChange={handleAllowKnockingChange}
                                />
                            </Row>
                        )}
                        <Row align="center" justify="between" fullWidth>
                            <Text>{t('words.public')}</Text>
                            <Switch
                                value={isPublic}
                                onValueChange={handlePublicChange}
                            />
                        </Row>
                        {isPublic && (
                            <Text small color={theme.colors.red}>
                                {t('feature.chat.public-group-warning')}
                            </Text>
                        )}
                    </Column>
                </Column>
            )
        }

        if (eligibleChats.length === 0) {
            return (
                <Column
                    gap="md"
                    align="center"
                    style={{ paddingVertical: theme.spacing.xl }}>
                    <SvgImage
                        name="SearchNoResult"
                        color={theme.colors.grey}
                        size={48}
                    />
                    <Text color={theme.colors.darkGrey} h2 center medium>
                        {t('feature.chat.no-public-chats-yet')}
                    </Text>
                    <Text color={theme.colors.grey} caption center>
                        {t('feature.chat.create-or-join-public-chat')}
                    </Text>
                </Column>
            )
        }

        return (
            <Column gap="md">
                <Text caption center>
                    {t('feature.chat.community-chat-description')}
                </Text>
                {eligibleChats.map(chat => (
                    <Pressable
                        key={`community-chat-${chat.id}`}
                        testID={`community-chat-${chat.id}`}
                        onPress={() => toggleSelectedChat(chat.id)}>
                        <Row align="center" gap="md">
                            <ChatAvatar size={AvatarSize.sm} room={chat} />
                            <Text
                                medium
                                style={{ flex: 1 }}
                                ellipsizeMode="tail"
                                numberOfLines={1}>
                                {chat.name}
                            </Text>
                            <SvgImage
                                name={
                                    selectedChats.includes(chat.id)
                                        ? 'CheckboxChecked'
                                        : 'CheckboxUnchecked'
                                }
                            />
                        </Row>
                    </Pressable>
                ))}
            </Column>
        )
    }, [
        isCreatingNewGroup,
        selectedChats,
        broadcastOnly,
        eligibleChats,
        t,
        theme,
        groupName,
        style,
        toggleSelectedChat,
        errorMessage,
        setBroadcastOnly,
        setGroupName,
        isPublic,
        handlePublicChange,
        allowKnocking,
        handleAllowKnockingChange,
        shouldShowAllowKnockingToggle,
    ])

    return (
        <CustomOverlay
            show={open}
            onBackdropPress={handleClose}
            contents={{
                title: (
                    <Text h2 medium>
                        {isCreatingNewGroup
                            ? t('feature.chat.create-a-group')
                            : t('feature.chat.add-community-chat')}
                    </Text>
                ),
                body: <ScrollView>{content}</ScrollView>,
                buttons: isCreatingNewGroup
                    ? [
                          {
                              text: t('words.cancel'),
                              onPress: cancelNewGroup,
                          },
                          {
                              text: t('phrases.save-changes'),
                              primary: true,
                              onPress: handleCreateGroup,
                              disabled:
                                  !groupName ||
                                  isCreatingGroup ||
                                  !!errorMessage,
                          },
                      ]
                    : [
                          {
                              text: t('feature.chat.new-group'),
                              onPress: startNewGroup,
                          },
                          {
                              text: t('words.continue'),
                              primary: true,
                              onPress: handleAccept,
                          },
                      ],
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        newGroupContainer: {
            paddingHorizontal: theme.spacing.md,
        },
        textInputOuter: {
            width: '100%',
            paddingHorizontal: 0,
        },
        textInputInner: {
            textAlignVertical: 'center',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
            padding: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
        },
    })
