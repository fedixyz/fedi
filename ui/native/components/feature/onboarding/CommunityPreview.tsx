import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
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

import { type CommunityPreview as CommunityPreviewType } from '@fedi/common/types'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    shouldShowJoinFederation,
} from '@fedi/common/utils/FederationUtils'

import { Column } from '../../ui/Flex'
import RotatingSvg from '../../ui/RotatingSvg'
import { SafeAreaContainer } from '../../ui/SafeArea'
import { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'

type Props = {
    community: CommunityPreviewType
    onJoin: () => void | Promise<void>
    onBack: () => void
    isJoining: boolean
}

const CommunityPreview: React.FC<Props> = ({
    community,
    onJoin,
    onBack,
    isJoining,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const showJoinFederation = shouldShowJoinFederation(community.meta)
    const [showTopShadow, setShowTopShadow] = useState(false)
    const [showBottomShadow, setShowBottomShadow] = useState(true)
    const tosUrl = getFederationTosUrl(community.meta)
    const welcomeMessage = getFederationWelcomeMessage(community.meta)
    const navigation = useNavigation()

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
            <Column grow center style={s.loadingContainer}>
                <RotatingSvg
                    name="FediLogoIcon"
                    size={SvgImageSize.md}
                    containerStyle={s.loadingIcon}
                />
            </Column>
        )
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
                onPress={onJoin}
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
                title={t('phrases.join-community')}
                onPress={onJoin}
                containerStyle={s.button}
                disabled={isJoining}
                loading={isJoining}
            />
        </View>
    )

    const welcomeTitle = community?.name
    const welcomeInstructions = t('feature.onboarding.welcome-instructions-new')

    return (
        <SafeAreaContainer edges="notop" style={s.joinPreviewContainer}>
            <Column grow shrink style={s.federationInfoContainer}>
                {showTopShadow && (
                    <View style={[s.scrollInsetShadow, s.scrollTopShadow]} />
                )}
                <ScrollView
                    contentContainerStyle={s.federationInfoScrollView}
                    onScroll={handleScroll}>
                    <Column center>
                        <FederationLogo federation={community} size={96} />
                        <Text h2 medium style={s.welcome}>
                            {welcomeTitle}
                        </Text>
                    </Column>

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
                    <View style={[s.scrollInsetShadow, s.scrollBottomShadow]} />
                )}
            </Column>

            <Column shrink={false}>
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

                {showJoinFederation === false && (
                    <View style={s.guidance}>
                        <Text small color={theme.colors.darkGrey} center>
                            {t('feature.communities.new-members-disabled')}
                        </Text>
                    </View>
                )}
            </Column>
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
            experimental_backgroundImage:
                'linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0))',
        },
        scrollBottomShadow: {
            bottom: 0,
            experimental_backgroundImage:
                'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.05))',
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

export default CommunityPreview
