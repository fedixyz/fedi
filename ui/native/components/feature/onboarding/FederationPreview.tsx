import { useNavigation } from '@react-navigation/native'
import { Button, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useLayoutEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
    Linking,
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'
import Hyperlink from 'react-native-hyperlink'
import LinearGradient from 'react-native-linear-gradient'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { JoinPreview } from '@fedi/common/types'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    getIsFederationSupported,
    shouldShowJoinFederation,
} from '@fedi/common/utils/FederationUtils'

import Flex from '../../ui/Flex'
import RotatingSvg from '../../ui/RotatingSvg'
import { SafeAreaContainer } from '../../ui/SafeArea'
import { SvgImageSize } from '../../ui/SvgImage'
import EndedFederationPreview from '../federations/EndedPreview'
import { FederationLogo } from '../federations/FederationLogo'

type Props = {
    federation: JoinPreview
    onJoin: (recoverFromScratch?: boolean) => void | Promise<void>
    onBack: () => void
}

const FederationPreview: React.FC<Props> = ({ federation, onJoin, onBack }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const showJoinFederation = shouldShowJoinFederation(federation.meta)
    const [isJoining, setIsJoining] = useState(false)
    const [selectedRecoverFromScratch, setSelectedRecoverFromScratch] =
        useState(false)
    const [showTopShadow, setShowTopShadow] = useState(false)
    const [showBottomShadow, setShowBottomShadow] = useState(true)
    const tosUrl = getFederationTosUrl(federation.meta)
    const welcomeMessage = getFederationWelcomeMessage(federation.meta)
    const isSupported = getIsFederationSupported(federation)
    const popupInfo = usePopupFederationInfo(federation.meta)
    const navigation = useNavigation()
    const isReturningMember =
        federation.hasWallet &&
        federation.returningMemberStatus.type === 'returningMember'

    const handleScroll = ({
        nativeEvent,
    }: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset } = nativeEvent

        setShowTopShadow(contentOffset.y > 0)
        setShowBottomShadow(contentOffset.y < 0)
    }

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
                <RotatingSvg
                    name="FediLogoIcon"
                    size={SvgImageSize.md}
                    containerStyle={s.loadingIcon}
                />
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

    if (!isSupported) {
        return (
            <View style={s.container}>
                <Flex center gap="sm" style={s.unsupportedContainer}>
                    <FederationLogo federation={federation} size={96} />
                    <Text h2 medium style={s.welcome}>
                        {federation?.name}
                    </Text>
                    <Flex center style={s.unsupportedBadge}>
                        <Text caption bold style={s.unsupportedBadgeLabel}>
                            {t('words.unsupported')}
                        </Text>
                    </Flex>
                    <Text caption style={s.welcomeText}>
                        {t('feature.onboarding.unsupported-notice')}
                    </Text>
                </Flex>
                <View style={s.buttonsContainer}>
                    <Button
                        fullWidth
                        title={t('words.okay')}
                        onPress={onBack}
                        containerStyle={s.button}
                    />
                </View>
            </View>
        )
    }

    const handleJoin = async () => {
        setIsJoining(true)
        try {
            await onJoin(selectedRecoverFromScratch)
        } catch {
            setIsJoining(false)
        }
    }

    const joinButtons = tosUrl ? (
        <View style={s.buttonsContainer}>
            <Button
                fullWidth
                type="clear"
                title={t('feature.onboarding.i-do-not-accept')}
                onPress={() =>
                    (navigation.getState()?.routes?.length || 0) > 1
                        ? navigation.goBack()
                        : navigation.reset({
                              index: 0,
                              routes: [{ name: 'TabsNavigator' }],
                          })
                }
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
                title={
                    federation.hasWallet
                        ? t('phrases.join-federation')
                        : t('phrases.join-community')
                }
                onPress={handleJoin}
                containerStyle={s.button}
                disabled={isJoining}
                loading={isJoining}
            />
        </View>
    )

    const welcomeTitle = federation?.name
    const welcomeInstructions =
        federation.hasWallet &&
        federation.returningMemberStatus.type === 'newMember'
            ? t('feature.onboarding.welcome-instructions-new')
            : isReturningMember
              ? t('feature.onboarding.welcome-instructions-returning')
              : t('feature.onboarding.welcome-instructions-unknown')

    return (
        <SafeAreaContainer edges="notop" style={s.joinPreviewContainer}>
            <Flex grow shrink style={s.federationInfoContainer}>
                {showTopShadow && (
                    <LinearGradient
                        style={[s.scrollInsetShadow, s.scrollTopShadow]}
                        colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0)']}
                    />
                )}
                <ScrollView
                    contentContainerStyle={s.federationInfoScrollView}
                    onScroll={handleScroll}>
                    <Flex center>
                        <FederationLogo federation={federation} size={96} />
                        <Text h2 medium style={s.welcome}>
                            {welcomeTitle}
                        </Text>
                    </Flex>

                    <View style={s.roundedCardContainer}>
                        <Text caption style={s.welcomeText}>
                            <Trans
                                components={{
                                    bold: (
                                        <Text
                                            caption
                                            bold
                                            style={s.welcomeText}
                                        />
                                    ),
                                }}>
                                {welcomeMessage ?? welcomeInstructions}
                            </Trans>
                        </Text>
                    </View>
                </ScrollView>
                {showBottomShadow && (
                    <LinearGradient
                        style={[s.scrollInsetShadow, s.scrollBottomShadow]}
                        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.05)']}
                    />
                )}
            </Flex>

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

                {joinButtons}

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
        },
        loadingIcon: { marginBottom: theme.spacing.md },
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
        unsupportedContainer: {
            maxWidth: 280,
            paddingTop: theme.spacing.xl,
        },
        unsupportedBadge: {
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xxs,
            borderRadius: 30,
            backgroundColor: theme.colors.red,
        },
        unsupportedBadgeLabel: { color: theme.colors.white },
        switchWrapper: {
            padding: theme.spacing.lg,
            borderRadius: 12,
            backgroundColor: theme.colors.offWhite,
        },
        scrollTopShadow: {
            top: 0,
        },
        scrollBottomShadow: {
            bottom: 0,
        },
        scrollInsetShadow: {
            position: 'absolute',
            height: 40,
            left: 0,
            right: 0,
            backgroundColor: 'transparent',
        },
        federationInfoContainer: {
            position: 'relative',
        },
        federationInfoScrollView: {
            paddingVertical: theme.spacing.xl,
        },
    })

export default FederationPreview
