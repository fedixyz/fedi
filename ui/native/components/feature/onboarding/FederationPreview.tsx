import { useNavigation } from '@react-navigation/native'
import { Button, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useLayoutEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import Hyperlink from 'react-native-hyperlink'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { RpcFederationPreview } from '@fedi/common/types/bindings'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    shouldShowJoinFederation,
} from '@fedi/common/utils/FederationUtils'

import Flex from '../../ui/Flex'
import { SafeAreaContainer } from '../../ui/SafeArea'
import ShadowScrollView from '../../ui/ShadowScrollView'
import EndedFederationPreview from '../federations/EndedPreview'
import { FederationLogo } from '../federations/FederationLogo'
import { HelpTextLoadingAnimation } from './HelpTextLoadingAnimation'

type Props = {
    federation: RpcFederationPreview
    onJoin: (recoverFromScratch?: boolean) => void | Promise<void>
    onBack: () => void
    isJoining: boolean
}

const FederationPreview: React.FC<Props> = ({
    federation,
    onJoin,
    onBack,
    isJoining,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const showJoinFederation = shouldShowJoinFederation(federation.meta)
    const [selectedRecoverFromScratch, setSelectedRecoverFromScratch] =
        useState(false)
    const tosUrl = getFederationTosUrl(federation.meta)
    const welcomeMessage = getFederationWelcomeMessage(federation.meta)
    const popupInfo = usePopupFederationInfo(federation.meta)
    const navigation = useNavigation()
    const isReturningMember =
        federation.returningMemberStatus.type === 'returningMember'

    useLayoutEffect(() => {
        navigation.setOptions({ headerShown: !isJoining })
        return () => {
            navigation.setOptions({ headerShown: true })
        }
    }, [navigation, isJoining])

    const s = styles(theme)

    if (isJoining) {
        return (
            <Flex grow center style={s.loadingContainer}>
                <HelpTextLoadingAnimation />
            </Flex>
        )
    }

    if (popupInfo?.ended) {
        return (
            <View style={s.container}>
                <EndedFederationPreview
                    popupInfo={popupInfo}
                    federation={federation}
                />
                <View style={s.buttonsContainer}>
                    <Button
                        fullWidth
                        title={t('phrases.go-back')}
                        onPress={navigation.goBack}
                        containerStyle={s.button}
                    />
                </View>
            </View>
        )
    }

    const handleJoin = () => {
        onJoin(selectedRecoverFromScratch)
    }

    const joinButtons = tosUrl ? (
        <View style={s.buttonsContainer}>
            <Button
                fullWidth
                type="clear"
                title={t('feature.onboarding.i-do-not-accept')}
                onPress={onBack}
                containerStyle={s.button}
            />
            <Button
                fullWidth
                title={t('feature.onboarding.i-accept')}
                onPress={handleJoin}
                containerStyle={s.button}
                disabled={isJoining}
                loading={isJoining}
            />
        </View>
    ) : (
        <View accessible={false} style={s.buttonsContainer}>
            <Button
                testID="JoinFederationButton"
                fullWidth
                title={t('phrases.join-federation')}
                onPress={handleJoin}
                containerStyle={s.button}
                disabled={isJoining}
                loading={isJoining}
            />
        </View>
    )

    const welcomeTitle = federation?.name

    return (
        <SafeAreaContainer edges="notop" style={s.joinPreviewContainer}>
            <ShadowScrollView>
                <Flex center>
                    <FederationLogo federation={federation} size={96} />
                    <Text h2 medium style={s.welcome}>
                        {welcomeTitle}
                    </Text>
                </Flex>

                {welcomeMessage && (
                    <View style={s.roundedCardContainer}>
                        <Trans
                            components={{
                                bold: (
                                    <Text caption bold style={s.welcomeText} />
                                ),
                            }}>
                            {welcomeMessage}
                        </Trans>
                    </View>
                )}
            </ShadowScrollView>

            <Flex shrink={false}>
                {showJoinFederation && isReturningMember && (
                    <Flex gap="sm" style={s.switchWrapper}>
                        <Flex row align="center" justify="between" gap="md">
                            <Flex grow shrink gap="sm">
                                <Text
                                    bold
                                    caption
                                    numberOfLines={1}
                                    ellipsizeMode="tail">
                                    {t(
                                        'feature.federations.recover-from-scratch',
                                    )}
                                </Text>
                                <Text small>
                                    {t(
                                        'feature.federations.recover-from-scratch-warning',
                                    )}
                                </Text>
                            </Flex>
                            <Switch
                                testID="RecoverFromScratchSwitch"
                                value={selectedRecoverFromScratch}
                                onValueChange={() => {
                                    setSelectedRecoverFromScratch(
                                        !selectedRecoverFromScratch,
                                    )
                                }}
                            />
                        </Flex>
                    </Flex>
                )}

                {showJoinFederation && joinButtons}

                {showJoinFederation && tosUrl && (
                    <View style={s.guidance}>
                        <Hyperlink
                            onPress={() => Linking.openURL(tosUrl)}
                            linkStyle={s.linkText}>
                            <Text small color={theme.colors.darkGrey} center>
                                {t('feature.onboarding.by-clicking-i-accept', {
                                    tos_url: tosUrl,
                                })}
                            </Text>
                        </Hyperlink>
                    </View>
                )}
            </Flex>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        loadingContainer: {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: 3,
            paddingBottom: 3,
            transform: [{ scale: 2 }],
        },
        loadingAnimationContainer: {
            marginBottom: theme.spacing.md,
            width: 200,
            height: 200,
            alignItems: 'center',
            justifyContent: 'center',
        },
        container: { flex: 1, padding: theme.spacing.xl },
        joinPreviewContainer: {
            gap: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
        },
        guidance: { marginBottom: theme.spacing.xs },
        button: { marginVertical: theme.spacing.sm, width: '100%' },
        linkText: { color: theme.colors.link },
        buttonsContainer: {
            width: '100%',
            marginBottom: theme.spacing.sm,
        },
        roundedCardContainer: {
            flexShrink: 1,
            backgroundColor: theme.colors.offWhite100,
            marginTop: 10,
            borderRadius: theme.borders.defaultRadius,
            marginHorizontal: 0,
            padding: theme.spacing.lg,
            borderWidth: 0,
            borderColor: 'transparent',
        },
        welcome: {
            marginTop: theme.spacing.md,
            marginBottom: theme.spacing.md,
            textAlign: 'center',
        },
        welcomeText: {
            fontWeight: '400',
            fontSize: 16,
            lineHeight: 20,
            letterSpacing: -0.16,
            textAlign: 'left',
        },
        switchWrapper: {
            padding: theme.spacing.lg,
            borderRadius: 12,
            backgroundColor: theme.colors.offWhite,
        },
    })

export default FederationPreview
