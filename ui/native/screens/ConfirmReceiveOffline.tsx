import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { receiveEcash, validateEcash } from '@fedi/common/redux'
import type { MSats } from '@fedi/common/types'
import { RpcEcashInfo } from '@fedi/common/types/bindings'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import FiatAmount from '../components/feature/wallet/FiatAmount'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch } from '../state/hooks'
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
    const [note, setNote] = useState('')
    const [receiving, setReceiving] = useState(false)

    useEffect(() => {
        dispatch(
            validateEcash({
                fedimint,
                ecash,
            }),
        )
            .unwrap()
            .then(setValidatedEcash)
            .catch(() => toast.error(t, 'errors.invalid-ecash-token'))
    }, [ecash, dispatch, toast, t])

    const amount = validatedEcash?.amount ?? (0 as MSats)

    const onReceive = useCallback(async () => {
        if (!validatedEcash) return

        // Don't call multiple times
        if (receiving) return
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

    const amountSats = amountUtils.msatToSat(amount)

    return (
        <View style={styles(theme).container}>
            <View style={styles(theme).offlineContainer}>
                <SvgImage name="Offline" />
                <Text caption>{t('phrases.you-are-offline')}</Text>
            </View>
            <View style={styles(theme).amountContainer}>
                {amountSats ? (
                    <Text h2>{`${amountUtils.formatNumber(amountSats)} `}</Text>
                ) : (
                    <ActivityIndicator />
                )}
                <Text>{`${t('words.sats').toUpperCase()}`}</Text>
            </View>

            <FiatAmount amountSats={amountSats} />
            <Input
                onChangeText={e => setNote(e)}
                value={note}
                placeholder={t('phrases.add-note')}
                returnKeyType="done"
                containerStyle={styles(theme).textInput}
            />
            <View style={styles(theme).actionContainer}>
                <Text caption style={styles(theme).offlineSpendNotice}>
                    {`${t('feature.receive.balance-not-spendable-offline')}`}
                </Text>
                <Button
                    fullWidth
                    title={t('feature.receive.receive-amount-unit', {
                        amount: amountUtils.formatNumber(
                            amountUtils.msatToSat(amount),
                        ),
                        unit: t('words.sats').toUpperCase(),
                    })}
                    onPress={onReceive}
                    loading={receiving}
                    containerStyle={styles(theme).buttonContainer}
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
            justifyContent: 'space-between',
            padding: theme.spacing.xl,
        },
        actionContainer: {
            marginTop: 'auto',
            width: '100%',
        },
        amountContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: theme.spacing.xxl,
        },
        buttonContainer: {
            marginTop: 'auto',
        },
        offlineSpendNotice: {
            marginVertical: theme.spacing.xl,
            paddingHorizontal: theme.spacing.xl,
            textAlign: 'center',
        },
        offlineContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.xl,
            gap: theme.spacing.sm,
        },
        offlineIcon: {
            height: theme.sizes.sm,
            width: theme.sizes.sm,
            marginRight: theme.spacing.md,
        },
        textInput: {
            width: '80%',
        },
    })

export default ConfirmReceiveOffline
