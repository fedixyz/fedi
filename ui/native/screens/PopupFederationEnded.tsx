import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Alert, Linking, StyleSheet, View } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import {
    changeAuthenticatedGuardian,
    leaveFederation,
    resetFederationChatState,
    selectActiveFederation,
} from '@fedi/common/redux'
import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { fedimint } from '../bridge'
import { FederationLogo } from '../components/ui/FederationLogo'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PopupFederationEnded'
>

const PopupFederationEnded: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const popupInfo = usePopupFederationInfo()
    const [isLeavingFederation, setIsLeavingFederation] = useState(false)
    const tosUrl = activeFederation?.meta
        ? getFederationTosUrl(activeFederation.meta)
        : null

    const dispatch = useAppDispatch()
    const style = styles(theme)
    const activeFederationId = activeFederation?.id

    const resetChatState = useCallback(() => {
        if (activeFederationId) {
            dispatch(
                resetFederationChatState({
                    federationId: activeFederationId,
                }),
            )
        }
    }, [activeFederationId, dispatch])

    const resetGuardiansState = useCallback(() => {
        dispatch(changeAuthenticatedGuardian(null))
    }, [dispatch])

    // TODO: this should be an thunkified action creator
    const handleLeaveFederation = useCallback(async () => {
        setIsLeavingFederation(true)
        try {
            if (activeFederationId) {
                // FIXME: currently this specific order of operations fixes a
                // bug where the username would get stuck in storage and when
                // rejoining the federation, the user cannot create an new
                // username with the fresh seed and the stored username fails
                // to authenticate so chat ends up totally broken
                // However it's not safe because if leaveFederation fails, then
                // we are resetting state too early and could corrupt things
                // Need to investigate further why running leaveFederation first
                // causes this bug
                resetChatState()
                resetGuardiansState()
                await dispatch(
                    leaveFederation({
                        fedimint,
                        federationId: activeFederationId,
                    }),
                ).unwrap()
                navigation.navigate('Initializing')
            }
        } catch (e) {
            toast.show({
                content: t('errors.failed-to-leave-federation'),
                status: 'error',
            })
        }
        setIsLeavingFederation(false)
    }, [
        activeFederationId,
        dispatch,
        navigation,
        resetChatState,
        resetGuardiansState,
        toast,
        t,
    ])

    const confirmLeaveFederation = () => {
        Alert.alert(
            t('feature.federations.leave-federation'),
            t('feature.federations.leave-federation-confirmation'),
            [
                {
                    text: t('words.no'),
                },
                {
                    text: t('words.yes'),
                    onPress: handleLeaveFederation,
                },
            ],
        )
    }

    return (
        <View style={styles(theme).container}>
            <View style={style.content}>
                <View style={style.contentSpacing}>
                    <FederationLogo federation={activeFederation} size={72} />
                </View>
                <Text h2 style={style.contentSpacing}>
                    {activeFederation?.name}
                </Text>
                <View style={[style.ended, style.contentSpacing]}>
                    <Text caption bold>
                        {t('feature.popup.ended')}
                    </Text>
                </View>
                <Text caption style={{ textAlign: 'center' }}>
                    {popupInfo?.endedMessage || (
                        <Trans
                            t={t}
                            i18nKey="feature.popup.ended-description"
                            values={{ date: popupInfo?.endsAtText }}
                            components={{ bold: <Text caption bold /> }}
                        />
                    )}
                </Text>
            </View>

            <View style={styles(theme).buttonsContainer}>
                {tosUrl && (
                    <Button
                        fullWidth
                        type="clear"
                        title={t('phrases.terms-and-conditions')}
                        onPress={() => {
                            Linking.openURL(tosUrl)
                        }}
                        containerStyle={styles(theme).button}
                    />
                )}
                <Button
                    fullWidth
                    title={t('feature.federations.leave-federation')}
                    onPress={confirmLeaveFederation}
                    containerStyle={styles(theme).button}
                    loading={isLeavingFederation}
                />
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
        content: {
            flex: 1,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '90%',
            maxWidth: 280,
            margin: 'auto',
        },
        contentSpacing: {
            marginBottom: theme.spacing.lg,
        },
        ended: {
            paddingVertical: theme.spacing.xxs,
            paddingHorizontal: theme.spacing.sm,
            backgroundColor: theme.colors.lightGrey,
            color: theme.colors.primary,
            borderRadius: 30,
        },
        button: {
            marginVertical: theme.sizes.xxs,
        },
        buttonsContainer: {
            marginTop: 'auto',
            width: '100%',
            alignItems: 'center',
        },
    })

export default PopupFederationEnded
