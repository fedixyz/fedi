import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Pressable, StyleSheet } from 'react-native'

import { useLeaveCommunity } from '@fedi/common/hooks/leave'
import { useToast } from '@fedi/common/hooks/toast'
import { selectCommunity } from '@fedi/common/redux'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
} from '@fedi/common/utils/FederationUtils'

import { fedimint } from '../bridge'
import { FederationLogo } from '../components/feature/federations/FederationLogo'
import CustomOverlay from '../components/ui/CustomOverlay'
import Flex from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
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
    const { canLeaveCommunity, handleLeave, isLeaving } = useLeaveCommunity({
        t,
        communityId,
        fedimint,
    })

    const community = useAppSelector(s => selectCommunity(s, communityId))
    const toast = useToast()

    const handleClose = () => {
        setWantsToLeaveCommunity(false)
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
            <Flex grow gap="lg" style={style.content}>
                <Flex row align="center" gap="lg" style={style.headerRow}>
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
                </Flex>
                {welcomeMessage && (
                    <Text caption maxFontSizeMultiplier={1.2}>
                        {welcomeMessage}
                    </Text>
                )}
            </Flex>
            <Flex gap="md">
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
                    <Flex center fullWidth>
                        <Pressable
                            onPress={() => setWantsToLeaveCommunity(true)}>
                            <Text style={style.leaveCommunityText}>
                                {t('feature.communities.leave-community')}
                            </Text>
                        </Pressable>
                    </Flex>
                )}
            </Flex>
            <CustomOverlay
                show={wantsToLeaveCommunity}
                onBackdropPress={handleClose}
                contents={{
                    body: (
                        <Flex gap="lg" align="center">
                            <Flex center style={style.iconContainer}>
                                <SvgImage
                                    name="Room"
                                    size={64}
                                    color={theme.colors.red}
                                />
                            </Flex>
                            <Text h2 medium>
                                {t('feature.communities.leave-community-title')}
                            </Text>
                            <Text center>
                                {t(
                                    'feature.communities.leave-community-description',
                                )}
                            </Text>
                        </Flex>
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
