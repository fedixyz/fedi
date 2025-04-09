import { Text, Theme, useTheme } from '@rneui/themed'
import { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { useFederationPreview } from '@fedi/common/hooks/federation'
import { RpcEcashInfo } from '@fedi/common/types/bindings'

import { fedimint } from '../../../bridge'
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

    const { isFetchingPreview, federationPreview, handleCode, handleJoin } =
        useFederationPreview(t, fedimint, inviteCode || '')

    useEffect(() => {
        if (!inviteCode) return
        // skip handling the code if we already have a preview
        if (federationPreview) return
        handleCode(inviteCode)
    }, [federationPreview, inviteCode, handleCode])

    const style = styles(theme)

    if (parsed.federation_type === 'joined') {
        return (
            <View style={style.container}>
                <Text style={style.center}>
                    {t('feature.omni.confirm-ecash-token')}
                </Text>
            </View>
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
                />
            )
        }

        return (
            <Pressable
                style={style.actionCardContainer}
                onPress={() => setShowFederationPreview(true)}>
                <View style={style.iconContainer}>
                    <FederationLogo federation={federationPreview} size={32} />
                </View>
                <View style={style.actionCardTextContainer}>
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
                </View>
                <View style={style.arrowContainer}>
                    <SvgImage name="ArrowRight" size={SvgImageSize.sm} />
                </View>
            </Pressable>
        )
    }

    return <View style={style.container}>{renderContent()}</View>
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            flexDirection: 'column',
            alignItems: 'stretch',
            paddingTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.md,
            gap: theme.spacing.lg,
            width: '100%',
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
        actionCardTextContainer: { alignItems: 'flex-start', gap: 2 },
        iconContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            height: 40,
            width: 40,
        },
        arrowContainer: { marginLeft: 'auto' },
        darkGrey: { color: theme.colors.darkGrey },
        buttonStyle: { width: '100%' },
        center: { textAlign: 'center' },
    })
