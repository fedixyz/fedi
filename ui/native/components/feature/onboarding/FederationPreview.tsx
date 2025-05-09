import { useNavigation } from '@react-navigation/native'
import { Button, Card, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Linking, ScrollView, StyleSheet, View } from 'react-native'
import Hyperlink from 'react-native-hyperlink'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { JoinPreview } from '@fedi/common/types'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    getIsFederationSupported,
    shouldShowJoinFederation,
} from '@fedi/common/utils/FederationUtils'

import RotatingSvg from '../../ui/RotatingSvg'
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
    const tosUrl = getFederationTosUrl(federation.meta)
    const welcomeMessage = getFederationWelcomeMessage(federation.meta)
    const isSupported = getIsFederationSupported(federation)
    const popupInfo = usePopupFederationInfo(federation.meta)
    const navigation = useNavigation()
    const isReturningMember =
        federation.hasWallet &&
        federation.returningMemberStatus.type === 'returningMember'

    useEffect(() => {
        navigation.setOptions({ headerShown: !isJoining })
    }, [isJoining, navigation])

    const s = styles(theme)

    if (isJoining) {
        return (
            <View style={s.loadingContainer}>
                <RotatingSvg
                    name="FediLogoIcon"
                    size={SvgImageSize.md}
                    containerStyle={s.loadingIcon}
                />
            </View>
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
                <View style={s.unsupportedContainer}>
                    <FederationLogo federation={federation} size={96} />
                    <Text h2 medium style={s.welcome}>
                        {federation?.name}
                    </Text>
                    <View style={s.unsupportedBadge}>
                        <Text caption bold style={s.unsupportedBadgeLabel}>
                            {t('words.unsupported')}
                        </Text>
                    </View>
                    <Text caption style={s.welcomeText}>
                        {t('feature.onboarding.unsupported-notice')}
                    </Text>
                </View>
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

    const welcomeTitle = federation?.name
    const welcomeInstructions =
        federation.hasWallet &&
        federation.returningMemberStatus.type === 'newMember'
            ? t('feature.onboarding.welcome-instructions-new')
            : isReturningMember
              ? t('feature.onboarding.welcome-instructions-returning')
              : t('feature.onboarding.welcome-instructions-unknown')

    return (
        <View style={s.container}>
            <View style={{ alignItems: 'center' }}>
                <FederationLogo federation={federation} size={96} />
                <Text h2 medium style={s.welcome}>
                    {welcomeTitle}
                </Text>
            </View>

            <Card containerStyle={s.roundedCardContainer}>
                <View style={s.cardContent}>
                    {welcomeMessage ? (
                        <ScrollView
                            style={s.scrollTos}
                            contentContainerStyle={{
                                padding: theme.spacing.md,
                            }}>
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
                                    {welcomeMessage}
                                </Trans>
                            </Text>
                        </ScrollView>
                    ) : (
                        <Text caption style={s.welcomeText}>
                            {welcomeInstructions}
                        </Text>
                    )}
                </View>
            </Card>

            <View style={s.bottomSection}>
                {showJoinFederation && isReturningMember && (
                    <View style={s.switchWrapper}>
                        <View style={s.switchLabelContainer}>
                            <Text bold caption>
                                {t('feature.federations.recover-from-scratch')}
                            </Text>
                            <Text small>
                                {t(
                                    'feature.federations.recover-from-scratch-warning',
                                )}
                            </Text>
                        </View>
                        <Switch
                            value={selectedRecoverFromScratch}
                            onValueChange={setSelectedRecoverFromScratch}
                        />
                    </View>
                )}

                {showJoinFederation && tosUrl && (
                    <View style={s.guidance}>
                        <Hyperlink
                            onPress={() => Linking.openURL(tosUrl)}
                            linkStyle={s.linkText}>
                            <Text
                                style={{
                                    fontSize: 14,
                                    color: theme.colors.darkGrey,
                                }}>
                                {t('feature.onboarding.by-clicking-i-accept', {
                                    tos_url: tosUrl,
                                })}
                            </Text>
                        </Hyperlink>
                    </View>
                )}

                <View style={s.buttonsContainer}>
                    <Button
                        fullWidth
                        title={t('feature.onboarding.i-accept')}
                        onPress={handleJoin}
                        containerStyle={s.button}
                        disabled={isJoining}
                        loading={isJoining}
                    />
                    <Button
                        fullWidth
                        type="clear"
                        title={t('feature.onboarding.i-do-not-accept')}
                        onPress={navigation.goBack}
                        containerStyle={s.button}
                    />
                </View>
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        loadingContainer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.lg,
        },
        loadingIcon: { marginBottom: theme.spacing.md },
        loadingTitle: {
            fontSize: 16,
            fontWeight: '600',
            marginBottom: theme.spacing.sm,
            textAlign: 'center',
            color: theme.colors.night,
        },
        loadingFactText: {
            textAlign: 'center',
            fontSize: 16,
            fontWeight: '500',
            color: theme.colors.darkGrey,
        },
        container: { flex: 1, padding: theme.spacing.xl },
        bottomSection: { marginTop: 'auto' },
        guidance: { marginBottom: theme.spacing.xs },
        button: { marginVertical: theme.spacing.sm, width: '100%' },
        linkText: { color: theme.colors.link },
        buttonsContainer: {
            width: '100%',
            flexDirection: 'column',
            marginBottom: theme.spacing.sm,
        },
        disabledNotice: {
            color: theme.colors.red,
            textAlign: 'center',
            marginVertical: theme.spacing.md,
        },
        roundedCardContainer: {
            flexShrink: 1,
            backgroundColor: theme.colors.offWhite100,
            marginTop: 10,
            borderRadius: theme.borders.defaultRadius,
            marginHorizontal: 0,
            padding: theme.spacing.md,
            borderWidth: 0,
            borderColor: 'transparent',
        },
        cardContent: { alignSelf: 'stretch' },
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
        scrollTos: { flexGrow: 1, flexShrink: 1, width: '100%' },
        unsupportedContainer: {
            maxWidth: 280,
            paddingTop: theme.spacing.xl,
            justifyContent: 'center',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        unsupportedBadge: {
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xxs,
            borderRadius: 30,
            backgroundColor: theme.colors.red,
        },
        unsupportedBadgeLabel: { color: theme.colors.white },
        switchWrapper: {
            margin: theme.spacing.xl,
            padding: theme.spacing.lg,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.offWhite,
            gap: theme.spacing.sm,
        },
        switchLabelContainer: {
            flex: 1,
            flexDirection: 'column',
            gap: theme.spacing.md,
        },
    })

export default FederationPreview
