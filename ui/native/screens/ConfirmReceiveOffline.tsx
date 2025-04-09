import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    receiveEcash,
    selectFederation,
    selectIsFederationRecovering,
    selectIsInternetUnreachable,
    validateEcash,
} from '@fedi/common/redux'
import type { MSats } from '@fedi/common/types'
import { RpcEcashInfo } from '@fedi/common/types/bindings'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import { FederationLogo } from '../components/feature/federations/FederationLogo'
import RecoveryInProgress from '../components/feature/recovery/RecoveryInProgress'
import FiatAmount from '../components/feature/wallet/FiatAmount'
import HoloAlert from '../components/ui/HoloAlert'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmReceiveOffline'
>

const log = makeLog('ConfirmReceiveOffline')

const ConfirmReceiveOffline: React.FC<Props> = ({
    route,
    navigation,
}: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const { ecash } = route.params
    const [validatedEcash, setValidatedEcash] = useState<RpcEcashInfo | null>(
        null,
    )
    const [receiving, setReceiving] = useState(false)

    const isOffline = useAppSelector(selectIsInternetUnreachable)

    const ecashFederation = useAppSelector(s => {
        if (validatedEcash?.federation_type === 'joined') {
            return selectFederation(s, validatedEcash.federation_id)
        }

        return null
    })
    const isFederationRecovering = useAppSelector(s => {
        if (validatedEcash?.federation_type === 'joined') {
            return selectIsFederationRecovering(s, validatedEcash.federation_id)
        }

        return false
    })

    const onReceive = useCallback(async () => {
        if (!validatedEcash || receiving) return

        // Don't call multiple times
        setReceiving(true)
        try {
            // Check to see if the user has joined a federation with a matching `validatedEcash.federationId`
            if (validatedEcash.federation_type !== 'joined') {
                throw new Error('errors.unknown-ecash-issuer')
            }

            const result = await dispatch(
                receiveEcash({
                    fedimint,
                    // If so, join from that federation
                    federationId: validatedEcash.federation_id,
                    ecash,
                }),
            ).unwrap()

            setReceiving(false)
            if (result.status === 'success' || result.status === 'pending') {
                navigation.navigate('ReceiveSuccess', {
                    // TODO: Fill out other fields? Missing some required Transaction fields.
                    tx: { amount: result.amount },
                    status: result.status,
                })
            } else if (result.status === 'failed') {
                log.warn('receiveEcash failed with error', result.error)
                throw new Error('errors.receive-ecash-failed-claimed')
            }
        } catch (e) {
            toast.error(t, e)
            setReceiving(false)
        }
    }, [ecash, dispatch, navigation, receiving, toast, t, validatedEcash])

    useEffect(() => {
        dispatch(validateEcash({ fedimint, ecash }))
            .unwrap()
            .then(setValidatedEcash)
            .catch(() => {
                // Should never happen since validateEcash is called in OmniInput,
                // which is the only way to get here
                log.error('PANIC: ecash validation failed')
                toast.error(t, 'errors.invalid-ecash-token')
            })
    }, [ecash, dispatch, toast, t])

    if (validatedEcash && validatedEcash.federation_type !== 'joined') {
        // Should never happen since you are required to go through the join flow
        // via OmniConfirmation before you hit this screen
        log.error('PANIC: federation_type is not joined')
        return null
    }

    const amount = validatedEcash?.amount ?? (0 as MSats)
    const amountSats = amountUtils.msatToSat(amount)

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <View style={style.content}>
                <View style={style.receiveIndicator}>
                    <Text maxFontSizeMultiplier={1.5}>
                        {t('feature.receive.receive-ecash-from')}
                    </Text>
                    {ecashFederation &&
                    ecashFederation.init_state === 'ready' ? (
                        <View style={style.federationIndicator}>
                            <FederationLogo
                                federation={ecashFederation}
                                size={24}
                            />
                            <Text
                                caption
                                bold
                                numberOfLines={1}
                                maxFontSizeMultiplier={1.5}>
                                {ecashFederation.name || ''}
                            </Text>
                        </View>
                    ) : (
                        <ActivityIndicator />
                    )}
                </View>
                <View style={style.amountContainer}>
                    <View style={style.satsContainer}>
                        {amountSats ? (
                            <Text
                                h1>{`${amountUtils.formatNumber(amountSats)} `}</Text>
                        ) : (
                            <ActivityIndicator />
                        )}
                        <Text h2>{`${t('words.sats').toUpperCase()}`}</Text>
                    </View>
                    <FiatAmount amountSats={amountSats} />
                </View>
            </View>
            <View style={style.actionContainer}>
                {isFederationRecovering && (
                    <HoloAlert>
                        <View style={style.recoveryIndicator}>
                            <Text>{t('phrases.recovery-in-progress')}</Text>
                            <View style={style.recoverySpinner}>
                                <RecoveryInProgress
                                    size={64}
                                    federationId={validatedEcash?.federation_id}
                                />
                            </View>
                        </View>
                    </HoloAlert>
                )}
                {isOffline && (
                    <HoloAlert>
                        <View style={style.offlineIndicator}>
                            <View style={style.offlineHeader}>
                                <SvgImage name="Offline" />
                                <Text bold>{t('phrases.youre-offline')}</Text>
                            </View>
                            <Text caption>
                                {t('feature.receive.claim-ecash-online')}
                            </Text>
                        </View>
                    </HoloAlert>
                )}
                <Button
                    fullWidth
                    title={t('feature.receive.receive-amount-unit', {
                        amount: amountUtils.formatNumber(
                            amountUtils.msatToSat(amount),
                        ),
                        unit: t('words.sats').toUpperCase(),
                    })}
                    onPress={onReceive}
                    disabled={isFederationRecovering}
                    loading={receiving}
                />
            </View>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        content: {
            paddingVertical: theme.spacing.xxl,
            alignItems: 'center',
            width: '100%',
        },
        amountContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
            paddingVertical: theme.spacing.xxl,
        },
        actionContainer: {
            width: '100%',
            gap: theme.spacing.lg,
            flex: 1,
            justifyContent: 'flex-end',
        },
        recoveryIndicator: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 64,
            width: '100%',
        },
        recoverySpinner: {
            width: 64,
            height: 64,
        },
        satsContainer: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        receiveIndicator: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        federationIndicator: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        offlineIndicator: {
            flexDirection: 'column',
            gap: theme.spacing.sm,
            alignItems: 'center',
            justifyContent: 'center',
        },
        offlineHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            width: '100%',
        },
    })

export default ConfirmReceiveOffline
