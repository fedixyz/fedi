import { Text, Theme, useTheme } from '@rneui/themed'
import { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { useFederationPreview } from '@fedi/common/hooks/federation'
import { RpcEcashInfo } from '@fedi/common/types/bindings'

import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import FederationPreview from '../onboarding/FederationPreview'

export default function OmniReceiveEcash({
    parsed,
    onContinue,
}: {
    parsed: RpcEcashInfo
    onContinue: () => void
}) {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [showFederationPreview, setShowFederationPreview] =
        useState<boolean>(false)

    const inviteCode = useMemo(() => {
        return parsed.federation_type === 'notJoined'
            ? parsed.federation_invite
            : null
    }, [parsed])

    const {
        isJoining,
        isFetchingPreview,
        federationPreview,
        handleCode,
        handleJoin,
    } = useFederationPreview(t, inviteCode || '')

    useEffect(() => {
        if (!inviteCode) return
        // skip handling the code if we already have a preview
        if (federationPreview) return
        handleCode(inviteCode)
    }, [federationPreview, inviteCode, handleCode])

    const style = styles(theme)

    if (parsed.federation_type === 'joined') {
        return (
            <Flex
                grow
                align="stretch"
                gap="lg"
                fullWidth
                style={style.container}>
                <Text style={style.center}>
                    {t('feature.omni.confirm-ecash-token')}
                </Text>
            </Flex>
        )
    }

    const renderContent = () => {
        // If the ecash does not include an invite code
        if (!inviteCode)
            return (
                <Text style={style.center}>
                    {t('errors.unknown-ecash-issuer')}
                </Text>
            )

        if (isFetchingPreview || !federationPreview)
            return <ActivityIndicator />

        if (showFederationPreview) {
            return (
                <FederationPreview
                    onJoin={() => handleJoin(onContinue)}
                    onBack={() => setShowFederationPreview(false)}
                    federation={federationPreview}
                    isJoining={isJoining}
                />
            )
        }

        return (
            <Pressable
                style={style.actionCardContainer}
                onPress={() => setShowFederationPreview(true)}>
                <Flex center style={style.iconContainer}>
                    <FederationLogo federation={federationPreview} size={32} />
                </Flex>
                <Flex align="start" gap="xxs">
                    <Text medium>
                        {t('feature.receive.join-new-federation')}
                    </Text>
                    <Text caption style={style.darkGrey}>
                        <Trans
                            t={t}
                            i18nKey="feature.receive.join-to-receive"
                            values={{
                                federation: federationPreview.name,
                            }}
                            components={{
                                bold: (
                                    <Text caption bold style={style.darkGrey} />
                                ),
                            }}
                        />
                    </Text>
                </Flex>
                <View style={style.arrowContainer}>
                    <SvgImage name="ArrowRight" size={SvgImageSize.sm} />
                </View>
            </Pressable>
        )
    }

    return (
        <Flex grow align="stretch" gap="lg" fullWidth style={style.container}>
            {renderContent()}
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.md,
        },
        actionCardContainer: {
            padding: theme.spacing.md,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.offWhite,
            borderRadius: 16,
            gap: 10,
        },
        iconContainer: {
            height: 40,
            width: 40,
        },
        arrowContainer: { marginLeft: 'auto' },
        darkGrey: { color: theme.colors.darkGrey },
        center: { textAlign: 'center' },
    })
