import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { useLeaveFederation } from '@fedi/common/hooks/leave'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectDefaultChats,
    selectLoadedFederation,
    selectShouldShowAutojoinedNoticeForFederation,
} from '@fedi/common/redux'
import { ChatType, MatrixRoom } from '@fedi/common/types'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
} from '@fedi/common/utils/FederationUtils'

import { fedimint } from '../bridge'
import FederationDetailStats from '../components/feature/federations/FederationDetailStats'
import { FederationLogo } from '../components/feature/federations/FederationLogo'
import FederationPopupCountdown from '../components/feature/federations/FederationPopupCountdown'
import FederationStatus from '../components/feature/federations/FederationStatus'
import AutojoinedCommunityNotice from '../components/feature/home/AutojoinedCommunityNotice'
import DefaultChatTile from '../components/feature/home/DefaultChatTile'
import Flex from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import ShadowScrollView from '../components/ui/ShadowScrollView'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'FederationDetails'
>

const FederationDetails: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { federationId } = route.params

    const [isLeavingFederation, setIsLeavingFederation] = useState(false)

    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const federationChats = useAppSelector(s =>
        selectDefaultChats(s, federationId),
    )
    const shouldShowAutojoinedCommunityNotice = useAppSelector(s =>
        selectShouldShowAutojoinedNoticeForFederation(s, federationId),
    )
    const popupInfo = usePopupFederationInfo(federation?.meta || {})
    const navigation = useNavigation()
    const toast = useToast()
    const handleOpenChat = (chat: MatrixRoom) => {
        navigation.navigate('ChatRoomConversation', {
            roomId: chat.id,
            chatType: chat.directUserId ? ChatType.direct : ChatType.group,
        })
    }
    const { handleLeaveFederation, validateCanLeaveFederation } =
        useLeaveFederation({
            t,
            federationId,
            fedimint,
        })

    const handleLeave = () => {
        if (!federation) return

        const canLeave = validateCanLeaveFederation(federation)

        if (canLeave) {
            setIsLeavingFederation(true)
            handleLeaveFederation()
                .then(() => {
                    navigation.dispatch(
                        reset('TabsNavigator', {
                            initialRouteName: 'Federations',
                        }),
                    )
                })
                .catch(e => toast.error(t, e))
                .finally(() => setIsLeavingFederation(false))
        }
    }

    if (!federation) return null

    const welcomeMessage = getFederationWelcomeMessage(federation.meta)
    const tosUrl = getFederationTosUrl(federation.meta)

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop">
            <Flex gap="lg" style={style.header}>
                <Flex row align="center" gap="lg">
                    <FederationLogo federation={federation} size={72} />
                    <Flex grow shrink>
                        <Text h2 medium maxFontSizeMultiplier={1.2}>
                            {federation.name}
                        </Text>
                    </Flex>
                </Flex>
                <Flex gap="md">
                    {shouldShowAutojoinedCommunityNotice && (
                        <AutojoinedCommunityNotice
                            federationId={federationId}
                        />
                    )}
                    <FederationPopupCountdown federation={federation} />
                    <FederationStatus federationId={federationId} />
                    <FederationDetailStats federation={federation} />
                </Flex>
            </Flex>
            <ShadowScrollView
                style={style.scrollContent}
                contentContainerStyle={style.scrollContentBody}>
                {federationChats.length > 0 && (
                    <Flex gap="sm" fullWidth>
                        <Text bold h2>
                            {t('feature.chat.federation-news')}
                        </Text>
                        {federationChats.map((chat, idx) => (
                            <DefaultChatTile
                                key={`chat-tile-${idx}`}
                                room={chat}
                                onSelect={handleOpenChat}
                                federationOrCommunity={federation}
                            />
                        ))}
                    </Flex>
                )}
                {welcomeMessage && (
                    <Text maxFontSizeMultiplier={1.2}>{welcomeMessage}</Text>
                )}
            </ShadowScrollView>
            <Flex style={style.actionsContainer} gap="md">
                {popupInfo?.ended && (
                    <Button
                        fullWidth
                        onPress={handleLeave}
                        title={t('feature.federations.leave-federation')}
                        loading={isLeavingFederation}
                    />
                )}
                {tosUrl && (
                    <Button
                        bubble
                        fullWidth
                        outline
                        onPress={() => Linking.openURL(tosUrl)}>
                        <Text adjustsFontSizeToFit medium numberOfLines={1}>
                            {t(
                                'feature.federations.federation-terms-and-conditions',
                            )}
                        </Text>
                    </Button>
                )}
            </Flex>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        scrollContent: {
            flex: 1,
        },
        scrollContentBody: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            gap: theme.spacing.lg,
        },
        header: {
            paddingVertical: theme.spacing.lg,
        },
        federationStatusCard: {
            backgroundColor: theme.colors.offWhite100,
            borderRadius: 20,
            padding: theme.spacing.md,
        },
        popupFederationCard: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.borders.defaultRadius,
        },
        federationEndedCard: {
            backgroundColor: theme.colors.extraLightGrey,
        },
        actionsContainer: {
            paddingTop: theme.spacing.lg,
        },
    })

export default FederationDetails
