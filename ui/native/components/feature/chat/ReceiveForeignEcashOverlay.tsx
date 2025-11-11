import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { useFederationPreview } from '@fedi/common/hooks/federation'
import { useMatrixPaymentEvent } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import { parseEcash } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppDispatch } from '../../../state/hooks'
import { MatrixPaymentEvent } from '../../../types'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import FederationPreview from '../onboarding/FederationPreview'

interface Props {
    paymentEvent: MatrixPaymentEvent
    show: boolean
    onDismiss: () => void
    onRejected: () => void
}

const log = makeLog('ReceiveForeignEcashOverlay')

const ReceiveForeignEcashOverlay: React.FC<Props> = ({
    paymentEvent,
    show,
    onDismiss,
    onRejected,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { theme } = useTheme()
    const [showFederationPreview, setShowFederationPreview] =
        useState<boolean>(false)
    const [hideOtherMethods, setHideOtherMethods] = useState<boolean>(true)
    const [inviteCode, setInviteCode] = useState<string | null>(null)
    const style = styles(theme)
    const dispatch = useAppDispatch()

    const {
        federationInviteCode,
        // paymentSender
    } = useMatrixPaymentEvent({
        event: paymentEvent,
        t,
        onError: _ => toast.error(t, 'errors.chat-payment-failed'),
    })
    const {
        isJoining,
        isFetchingPreview,
        federationPreview,
        handleCode,
        handleJoin,
    } = useFederationPreview(t, federationInviteCode || '')

    useEffect(() => {
        if (!paymentEvent.content.ecash) return

        dispatch(
            parseEcash({
                fedimint,
                ecash: paymentEvent.content.ecash,
            }),
        )
            .unwrap()
            .then(parsed => {
                if (parsed.federation_type === 'joined') {
                    log.error('federation should not be joined')
                    return
                }

                setInviteCode(
                    parsed.federation_invite || federationInviteCode || '',
                )
            })
    }, [paymentEvent.content.ecash, federationInviteCode, dispatch])

    useEffect(() => {
        if (!inviteCode) return
        // skip handling the code if we already have a preview
        if (federationPreview) return
        handleCode(inviteCode)
    }, [federationPreview, inviteCode, handleCode])

    const renderOverlayContents = () => {
        if (isFetchingPreview) return <ActivityIndicator />
        if (federationPreview && showFederationPreview) {
            return (
                <FederationPreview
                    onJoin={() => handleJoin(onDismiss)}
                    onBack={() => setShowFederationPreview(false)}
                    federation={federationPreview}
                    isJoining={isJoining}
                />
            )
        }
        return (
            <Flex align="start" gap="lg" fullWidth style={style.optionsList}>
                {federationPreview ? (
                    <Pressable
                        style={style.actionCardContainer}
                        onPress={() => setShowFederationPreview(true)}>
                        <View style={style.iconContainer}>
                            <FederationLogo
                                federation={federationPreview}
                                size={32}
                            />
                        </View>
                        <Flex align="start" gap="xs">
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
                                            <Text
                                                caption
                                                bold
                                                style={style.darkGrey}
                                            />
                                        ),
                                    }}
                                />
                            </Text>
                        </Flex>
                        <View style={style.arrowContainer}>
                            <SvgImage
                                name="ArrowRight"
                                size={SvgImageSize.sm}
                            />
                        </View>
                    </Pressable>
                ) : (
                    <Text center>{t('errors.unknown-ecash-issuer')}</Text>
                )}

                {!hideOtherMethods && (
                    <>
                        {/* TODO: Implement request via lightning */}
                        {/* <Pressable style={style.actionCardContainer}>
                            <View
                                style={[
                                    style.iconContainer,
                                    style.roundIconContainer,
                                    {
                                        backgroundColor: theme.colors.orange,
                                    },
                                ]}>
                                <SvgImage
                                    name="Bolt"
                                    size={SvgImageSize.sm}
                                    color={theme.colors.white}
                                />
                            </View>
                            <View style={style.actionCardTextContainer}>
                                <Text medium>
                                    {t('feature.receive.request-via-lightning')}
                                </Text>
                                <Text
                                    small
                                    style={{
                                        color: theme.colors.darkGrey,
                                    }}>
                                    {t(
                                        'feature.receive.send-a-lightning-request',
                                        {
                                            username:
                                                paymentSender?.displayName ||
                                                '',
                                        },
                                    )}
                                </Text>
                            </View>
                            <View style={style.arrowContainer}>
                                <SvgImage
                                    name="ArrowRight"
                                    size={SvgImageSize.sm}
                                />
                            </View>
                        </Pressable> */}
                        <Pressable
                            style={style.actionCardContainer}
                            onPress={() => onRejected()}>
                            <Flex
                                center
                                style={[
                                    style.iconContainer,
                                    style.roundIconContainer,
                                    {
                                        backgroundColor: theme.colors.red,
                                    },
                                ]}>
                                <SvgImage
                                    name="BrokenHeart"
                                    size={SvgImageSize.sm}
                                    color={theme.colors.white}
                                />
                            </Flex>
                            <Flex align="start" gap="xs">
                                <Text medium>
                                    {t('feature.receive.reject-payment')}
                                </Text>
                            </Flex>
                            <View style={style.arrowContainer}>
                                <SvgImage
                                    name="ArrowRight"
                                    size={SvgImageSize.sm}
                                />
                            </View>
                        </Pressable>
                    </>
                )}
                <Pressable
                    style={style.otherMethodsButton}
                    onPress={() => setHideOtherMethods(!hideOtherMethods)}>
                    <Text medium>
                        {hideOtherMethods
                            ? t('feature.receive.other-methods')
                            : t('feature.receive.hide-other-methods')}
                    </Text>
                    <View
                        style={{
                            transform: [
                                {
                                    rotate: '90deg',
                                },
                            ],
                        }}>
                        <SvgImage
                            name={
                                hideOtherMethods
                                    ? 'ChevronRight'
                                    : 'ChevronLeft'
                            }
                            size={SvgImageSize.sm}
                        />
                    </View>
                </Pressable>
            </Flex>
        )
    }

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={onDismiss}
            contents={{
                title: t('words.receive'),
                body: renderOverlayContents(),
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        optionsList: {
            paddingTop: theme.spacing.md,
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
        roundIconContainer: {
            borderRadius: 20,
        },
        arrowContainer: { marginLeft: 'auto' },
        darkGrey: { color: theme.colors.darkGrey },
        otherMethodsButton: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
            gap: 8,
        },
    })

export default ReceiveForeignEcashOverlay
