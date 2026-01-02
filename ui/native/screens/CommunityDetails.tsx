import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Pressable, StyleSheet } from 'react-native'

import { useLeaveCommunity } from '@fedi/common/hooks/leave'
import { useToast } from '@fedi/common/hooks/toast'
import { selectCommunity, selectDefaultChats } from '@fedi/common/redux'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
} from '@fedi/common/utils/FederationUtils'

import { FederationLogo } from '../components/feature/federations/FederationLogo'
import DefaultChatTile from '../components/feature/home/DefaultChatTile'
import CustomOverlay from '../components/ui/CustomOverlay'
import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import { ChatType, MatrixRoom } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'CommunityDetails'
>

const CommunityDetails: React.FC<Props> = ({ route, navigation }: Props) => {
    const [wantsToLeaveCommunity, setWantsToLeaveCommunity] = useState(false)

    const { t } = useTranslation()
    const { theme } = useTheme()
    const { communityId } = route.params
    const { canLeaveCommunity, handleLeave, isLeaving } =
        useLeaveCommunity(communityId)

    const community = useAppSelector(s => selectCommunity(s, communityId))
    const chats = useAppSelector(s => selectDefaultChats(s, communityId))
    const toast = useToast()

    const handleClose = () => {
        setWantsToLeaveCommunity(false)
    }

    const handleOpenChat = (chat: MatrixRoom) => {
        navigation.navigate('ChatRoomConversation', {
            roomId: chat.id,
            chatType: chat.directUserId ? ChatType.direct : ChatType.group,
        })
    }

    const onLeave = () => {
        handleLeave()
            .then(() => navigation.dispatch(reset('TabsNavigator')))
            .catch(e => toast.error(t, e))
    }

    if (!community) return null

    const welcomeMessage = getFederationWelcomeMessage(community.meta)
    const tosUrl = getFederationTosUrl(community.meta)
    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop">
            <Column grow gap="lg" style={style.content}>
                <Row align="center" gap="lg" style={style.headerRow}>
                    <FederationLogo federation={community} size={72} />
                    <Text
                        h2
                        medium
                        maxFontSizeMultiplier={1.2}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.5}
                        ellipsizeMode="tail"
                        style={style.title}>
                        {community.name}
                    </Text>
                </Row>
                {chats.length > 0 && (
                    <Column gap="sm" fullWidth>
                        <Text bold h2>
                            {t('feature.home.community-news-title')}
                        </Text>
                        {chats.map((chat, idx) => (
                            <DefaultChatTile
                                key={`chat-tile-${idx}`}
                                room={chat}
                                onSelect={handleOpenChat}
                            />
                        ))}
                    </Column>
                )}
                {welcomeMessage && (
                    <Text caption maxFontSizeMultiplier={1.2}>
                        {welcomeMessage}
                    </Text>
                )}
            </Column>
            <Column gap="md">
                {tosUrl && (
                    <Button
                        bubble
                        fullWidth
                        outline
                        onPress={() => Linking.openURL(tosUrl)}>
                        <Text
                            adjustsFontSizeToFit
                            medium
                            center
                            numberOfLines={1}>
                            {t(
                                'feature.communities.community-terms-and-conditions',
                            )}
                        </Text>
                    </Button>
                )}
                {canLeaveCommunity && (
                    <Column center fullWidth>
                        <Pressable
                            onPress={() => setWantsToLeaveCommunity(true)}>
                            <Text style={style.leaveCommunityText}>
                                {t('feature.communities.leave-community')}
                            </Text>
                        </Pressable>
                    </Column>
                )}
            </Column>
            <CustomOverlay
                show={wantsToLeaveCommunity}
                onBackdropPress={handleClose}
                contents={{
                    body: (
                        <Column gap="lg" align="center">
                            <Column center style={style.iconContainer}>
                                <SvgImage
                                    name="Room"
                                    size={64}
                                    color={theme.colors.red}
                                />
                            </Column>
                            <Text h2 medium>
                                {t('feature.communities.leave-community-title')}
                            </Text>
                            <Text center>
                                {t(
                                    'feature.communities.leave-community-description',
                                )}
                            </Text>
                        </Column>
                    ),
                    buttons: [
                        {
                            text: t('feature.communities.confirm-exit'),
                            onPress: onLeave,
                            disabled: isLeaving,
                        },
                        {
                            text: t('words.cancel'),
                            onPress: handleClose,
                            primary: true,
                        },
                    ],
                }}
            />
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.lg,
        },
        content: {
            paddingVertical: theme.spacing.lg,
        },
        headerRow: {
            minWidth: 0,
        },
        textContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.md,
        },
        title: {
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
        },
        leaveCommunityText: {
            textDecorationLine: 'underline',
        },
        iconContainer: {
            borderRadius: 1024,
            backgroundColor: theme.colors.red100,
            width: 120,
            height: 120,
            aspectRatio: 1,
        },
    })

export default CommunityDetails
