import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Linking, StyleSheet } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import {
    changeAuthenticatedGuardian,
    leaveFederation,
    selectActiveFederation,
} from '@fedi/common/redux'
import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { fedimint } from '../bridge'
import FederationEndedPreview from '../components/feature/federations/EndedPreview'
import Flex from '../components/ui/Flex'
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
    const activeFederationId = activeFederation?.id

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

    const style = styles(theme)

    return (
        <Flex grow center style={style.container}>
            {activeFederation && (
                <FederationEndedPreview
                    popupInfo={popupInfo}
                    federation={activeFederation}
                />
            )}
            <Flex align="center" fullWidth style={style.buttonsContainer}>
                {tosUrl && (
                    <Button
                        fullWidth
                        type="clear"
                        title={t('phrases.terms-and-conditions')}
                        onPress={() => {
                            Linking.openURL(tosUrl)
                        }}
                        containerStyle={style.button}
                    />
                )}
                <Button
                    fullWidth
                    title={t('feature.federations.leave-federation')}
                    onPress={confirmLeaveFederation}
                    containerStyle={style.button}
                    loading={isLeavingFederation}
                />
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.xl,
        },
        button: {
            marginVertical: theme.sizes.xxs,
        },
        buttonsContainer: {
            marginTop: 'auto',
        },
    })

export default PopupFederationEnded
