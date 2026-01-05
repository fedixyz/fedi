import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    receiveEcash,
    selectFederation,
    selectIsFederationRecovering,
    selectIsInternetUnreachable,
    parseEcash,
} from '@fedi/common/redux'
import type { MSats } from '@fedi/common/types'
import { RpcEcashInfo } from '@fedi/common/types/bindings'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { FederationLogo } from '../components/feature/federations/FederationLogo'
import RecoveryInProgress from '../components/feature/recovery/RecoveryInProgress'
import FiatAmount from '../components/feature/wallet/FiatAmount'
import Flex from '../components/ui/Flex'
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
    const fedimint = useFedimint()
    const { ecash } = route.params
    const [parsedEcash, setParsedEcash] = useState<RpcEcashInfo | null>(null)
    const [receiving, setReceiving] = useState(false)

    const isOffline = useAppSelector(selectIsInternetUnreachable)

    const ecashFederation = useAppSelector(s => {
        if (parsedEcash?.federation_type === 'joined') {
            return selectFederation(s, parsedEcash.federation_id)
        }

        return null
    })
    const isFederationRecovering = useAppSelector(s => {
        if (parsedEcash?.federation_type === 'joined') {
            return selectIsFederationRecovering(s, parsedEcash.federation_id)
        }

        return false
    })

    const onReceive = useCallback(async () => {
        if (!parsedEcash || receiving) return

        // Don't call multiple times
        setReceiving(true)
        try {
            // Check to see if the user has joined a federation with a matching `parsedEcash.federationId`
            if (parsedEcash.federation_type !== 'joined') {
                throw new Error('errors.unknown-ecash-issuer')
            }

            const result = await dispatch(
                receiveEcash({
                    fedimint,
                    // If so, join from that federation
                    federationId: parsedEcash.federation_id,
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
    }, [
        ecash,
        dispatch,
        navigation,
        receiving,
        toast,
        t,
        parsedEcash,
        fedimint,
    ])

    useEffect(() => {
        dispatch(parseEcash({ fedimint, ecash }))
            .unwrap()
            .then(setParsedEcash)
            .catch(() => {
                // Should never happen since parseEcash is called in OmniInput,
                // which is the only way to get here
                log.error('PANIC: ecash validation failed')
                toast.error(t, 'errors.invalid-ecash-token')
            })
    }, [ecash, dispatch, toast, t, fedimint])

    if (parsedEcash && parsedEcash.federation_type !== 'joined') {
        // Should never happen since you are required to go through the join flow
        // via OmniConfirmation before you hit this screen
        log.error('PANIC: federation_type is not joined')
        return null
    }

    const amount = parsedEcash?.amount ?? (0 as MSats)
    const amountSats = amountUtils.msatToSat(amount)

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <Flex align="center" fullWidth style={style.content}>
                <Flex row align="center" gap="sm">
                    <Text maxFontSizeMultiplier={1.5}>
                        {t('feature.receive.receive-ecash-from')}
                    </Text>
                    {ecashFederation &&
                    ecashFederation.init_state === 'ready' ? (
                        <Flex row align="center" gap="sm">
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
                        </Flex>
                    ) : (
                        <ActivityIndicator />
                    )}
                </Flex>
                <Flex center gap="xs" style={style.amountContainer}>
                    <Flex row align="center">
                        {amountSats ? (
                            <Text
                                h1>{`${amountUtils.formatNumber(amountSats)} `}</Text>
                        ) : (
                            <ActivityIndicator />
                        )}
                        <Text h2>{`${t('words.sats').toUpperCase()}`}</Text>
                    </Flex>
                    <FiatAmount amountSats={amountSats} />
                </Flex>
            </Flex>
            <Flex grow justify="end" gap="lg" fullWidth>
                {isFederationRecovering && (
                    <HoloAlert>
                        <Flex
                            row
                            align="center"
                            justify="between"
                            fullWidth
                            style={style.recoveryIndicator}>
                            <Text>{t('phrases.recovery-in-progress')}</Text>
                            <View style={style.recoverySpinner}>
                                <RecoveryInProgress
                                    size={64}
                                    federationId={parsedEcash?.federation_id}
                                />
                            </View>
                        </Flex>
                    </HoloAlert>
                )}
                {isOffline && (
                    <HoloAlert>
                        <Flex center gap="sm">
                            <Flex row align="center" gap="sm">
                                <SvgImage name="Offline" />
                                <Text bold>{t('phrases.youre-offline')}</Text>
                            </Flex>
                            <Text caption>
                                {t('feature.receive.claim-ecash-online')}
                            </Text>
                        </Flex>
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
            </Flex>
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
        },
        amountContainer: {
            paddingVertical: theme.spacing.xxl,
        },
        recoveryIndicator: {
            minHeight: 64,
        },
        recoverySpinner: {
            width: 64,
            height: 64,
        },
    })

export default ConfirmReceiveOffline
