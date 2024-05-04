import { Button, Card, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { FederationPreview as FederationPreviewType } from '@fedi/common/types'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    getIsFederationSupported,
    shouldShowJoinFederation,
} from '@fedi/common/utils/FederationUtils'

import { FederationLogo } from '../../ui/FederationLogo'
import HoloGradient from '../../ui/HoloGradient'
import AcceptTermsOfService from './AcceptTermsOfService'

type Props = {
    federation: FederationPreviewType
    onJoin: () => void | Promise<void>
    onBack: () => void
}

const FederationPreview: React.FC<Props> = ({ federation, onJoin, onBack }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [showTerms, setShowTerms] = useState<boolean>(false)
    const showJoinFederation = shouldShowJoinFederation(federation.meta)
    const [isJoining, setIsJoining] = useState(false)
    const tosUrl = getFederationTosUrl(federation.meta)
    const welcomeMessage = getFederationWelcomeMessage(federation.meta)
    const isSupported = getIsFederationSupported(federation)

    const style = styles(theme)

    if (!isSupported) {
        return (
            <View style={style.container}>
                <View style={style.unsupportedContainer}>
                    <FederationLogo federation={federation} size={96} />
                    <Text h2 medium style={style.welcome}>
                        {federation?.name}
                    </Text>
                    <View style={style.unsupportedBadge}>
                        <Text caption bold style={style.unsupportedBadgeLabel}>
                            {t('words.unsupported')}
                        </Text>
                    </View>
                    <Text caption style={style.welcomeText}>
                        {t('feature.onboarding.unsupported-notice')}
                    </Text>
                </View>
                <View style={style.buttonsContainer}>
                    <Button
                        fullWidth
                        title={t('words.okay')}
                        onPress={() => onBack()}
                        containerStyle={style.button}
                    />
                </View>
            </View>
        )
    }

    if (showTerms) {
        return (
            <AcceptTermsOfService
                onAccept={() => onJoin()}
                onReject={() => setShowTerms(false)}
                federation={federation}
            />
        )
    }

    const handleJoin = async () => {
        setIsJoining(true)
        if (tosUrl) {
            setShowTerms(true)
        } else {
            try {
                await onJoin()
            } catch {
                /* no-op, onJoin should handle */
            }
        }
        setIsJoining(false)
    }

    const welcomeTitle =
        federation.returningMemberStatus.type === 'returningMember'
            ? t('feature.onboarding.welcome-back-to-federation', {
                  federation: federation?.name,
              })
            : t('feature.onboarding.welcome-to-federation', {
                  federation: federation?.name,
              })
    const welcomeInstructions =
        federation.returningMemberStatus.type === 'newMember'
            ? t('feature.onboarding.welcome-instructions-new')
            : federation.returningMemberStatus.type === 'returningMember'
            ? t('feature.onboarding.welcome-instructions-returning')
            : t('feature.onboarding.welcome-instructions-unknown')

    return (
        <View style={style.container}>
            <Card containerStyle={style.roundedCardContainer}>
                <ScrollView contentContainerStyle={style.innerCardContainer}>
                    <FederationLogo federation={federation} size={96} />
                    <Text h2 medium style={style.welcome}>
                        {welcomeTitle}
                    </Text>
                    {welcomeMessage ? (
                        <HoloGradient
                            level="100"
                            style={style.customWelcomeContainer}
                            gradientStyle={style.customWelcomeInner}>
                            <Text caption style={style.welcomeText}>
                                <Trans
                                    components={{
                                        bold: (
                                            <Text
                                                caption
                                                bold
                                                style={style.welcomeText}
                                            />
                                        ),
                                    }}>
                                    {welcomeMessage}
                                </Trans>
                            </Text>
                        </HoloGradient>
                    ) : (
                        <Text caption style={style.welcomeText}>
                            {welcomeInstructions}
                        </Text>
                    )}
                </ScrollView>
            </Card>
            <View style={style.buttonsContainer}>
                {showJoinFederation ? (
                    <>
                        <Button
                            fullWidth
                            title={t('words.continue')}
                            onPress={() => handleJoin()}
                            containerStyle={style.button}
                            disabled={isJoining}
                            loading={isJoining}
                        />
                    </>
                ) : (
                    <Text caption style={style.disabledNotice}>
                        {t('feature.onboarding.new-users-disabled-notice')}
                    </Text>
                )}
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
        },
        button: {
            marginVertical: theme.sizes.xxs,
        },
        buttonsContainer: {
            marginTop: 'auto',
            width: '100%',
            alignItems: 'center',
        },
        disabledNotice: {
            color: theme.colors.red,
            textAlign: 'center',
            width: '100%',
            marginVertical: theme.sizes.md,
        },
        roundedCardContainer: {
            marginTop: 'auto',
            borderRadius: theme.borders.defaultRadius,
            marginHorizontal: 0,
            padding: theme.spacing.xl,
            maxHeight: '60%',
        },
        innerCardContainer: {
            alignItems: 'center',
        },
        welcome: {
            marginTop: theme.spacing.md,
            marginBottom: theme.spacing.md,
            textAlign: 'center',
        },
        welcomeText: {
            textAlign: 'center',
            lineHeight: 20,
        },
        customWelcomeContainer: {
            borderRadius: theme.spacing.lg,
            overflow: 'hidden',
        },
        customWelcomeInner: {
            padding: theme.spacing.md,
        },
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
        unsupportedBadgeLabel: {
            color: theme.colors.white,
        },
    })

export default FederationPreview
