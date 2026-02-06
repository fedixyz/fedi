import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { useAcceptForeignEcash } from '@fedi/common/hooks/chat'

import { MatrixPaymentEvent } from '../../../types'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import FederationPreview from '../onboarding/FederationPreview'

interface Props {
    paymentEvent: MatrixPaymentEvent
    show: boolean
    onDismiss: () => void
    onRejected: () => void
}

const ReceiveForeignEcashOverlay: React.FC<Props> = ({
    paymentEvent,
    show,
    onDismiss,
    onRejected,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const {
        isJoining,
        isFetchingPreview,
        federationPreview,
        handleJoin,
        showFederationPreview,
        setShowFederationPreview,
        hideOtherMethods,
        setHideOtherMethods,
    } = useAcceptForeignEcash(t, paymentEvent)

    const style = styles(theme)

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
            <Column align="start" gap="lg" fullWidth style={style.optionsList}>
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
                        <Column align="start" gap="xs">
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
                        </Column>
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
                            <Column
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
                            </Column>
                            <Column align="start" gap="xs">
                                <Text medium>
                                    {t('feature.receive.reject-payment')}
                                </Text>
                            </Column>
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
            </Column>
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
