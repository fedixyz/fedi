import { Button, Overlay, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
    Linking,
    Pressable,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import {
    selectActiveFederation,
    selectFederationMetadata,
} from '@fedi/common/redux'
import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { FALLBACK_TERMS_URL } from '../../../constants'
import { useAppSelector } from '../../../state/hooks'
import { FederationLogo } from './FederationLogo'

export const PopupFederationCountdown: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)
    const activeFederation = useAppSelector(selectActiveFederation)
    const activeFederationMetadata = useAppSelector(selectFederationMetadata)
    const tosUrl = getFederationTosUrl(activeFederationMetadata)
    const popupInfo = usePopupFederationInfo()
    const [isOverlayVisible, setIsOverlayVisible] = useState(false)

    if (!activeFederation || !popupInfo) return null

    const pillStyles: StyleProp<ViewStyle>[] = [style.pill]
    if (popupInfo.ended) {
        pillStyles.push(style.pillEnded)
    } else if (popupInfo.endsSoon) {
        pillStyles.push(style.pillEndsSoon)
    }

    const textStyle = popupInfo.endsSoon ? style.lightText : undefined

    const countdownI18nText =
        popupInfo.secondsLeft <= 0 ? (
            <Text caption bold>
                {t('feature.popup.ended')}
            </Text>
        ) : (
            <Text caption style={textStyle}>
                <Trans
                    t={t}
                    i18nKey="feature.popup.ending-in"
                    values={{ time: popupInfo.endsInText }}
                    components={{
                        bold: <Text caption bold style={textStyle} />,
                    }}
                />
            </Text>
        )

    return (
        <View style={style.container}>
            <Pressable
                style={pillStyles}
                onPress={() => setIsOverlayVisible(true)}>
                {countdownI18nText}
            </Pressable>
            <Overlay
                isVisible={isOverlayVisible}
                overlayStyle={style.overlay}
                onBackdropPress={() => setIsOverlayVisible(false)}>
                <View style={style.overlayContent}>
                    <View style={style.overlaySpacing}>
                        <FederationLogo
                            federation={activeFederation}
                            size={72}
                        />
                    </View>
                    <Text h2 style={style.overlaySpacing}>
                        {activeFederation.name}
                    </Text>
                    <View style={[pillStyles, style.overlaySpacing]}>
                        {countdownI18nText}
                    </View>
                    <Text caption style={style.overlaySpacing}>
                        {popupInfo.countdownMessage || (
                            <Trans
                                t={t}
                                i18nKey="feature.popup.ending-description"
                                values={{ date: popupInfo.endsAtText }}
                                components={{ bold: <Text caption bold /> }}
                            />
                        )}
                    </Text>
                    <Button
                        fullWidth
                        onPress={() => setIsOverlayVisible(false)}>
                        {t('phrases.i-understand')}
                    </Button>
                    {tosUrl && (
                        <Button
                            type="clear"
                            fullWidth
                            containerStyle={style.buttonContainer}
                            buttonStyle={style.button}
                            onPress={() =>
                                Linking.openURL(tosUrl || FALLBACK_TERMS_URL)
                            }>
                            {t('feature.onboarding.terms-and-conditions')}
                        </Button>
                    )}
                </View>
            </Overlay>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
        },
        pill: {
            paddingVertical: theme.spacing.xxs,
            paddingHorizontal: theme.spacing.sm,
            backgroundColor: '#BAE0FE',
            color: theme.colors.primary,
            borderRadius: 30,
        },
        pillEndsSoon: {
            backgroundColor: theme.colors.red,
            color: theme.colors.white,
        },
        pillEnded: {
            backgroundColor: theme.colors.lightGrey,
            color: theme.colors.primary,
        },
        button: {
            backgroundColor: theme.colors.secondary,
        },
        buttonContainer: {
            marginVertical: theme.spacing.sm,
        },
        lightText: {
            color: theme.colors.secondary,
        },
        overlay: {
            borderRadius: 20,
            padding: theme.spacing.xl,
            paddingTop: theme.spacing.xxl,
        },
        overlayContent: {
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            margin: 'auto',
        },
        overlaySpacing: {
            marginBottom: theme.spacing.lg,
        },
    })
