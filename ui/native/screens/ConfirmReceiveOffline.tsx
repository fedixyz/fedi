import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import type { MSats, Transaction } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import FiatAmount from '../components/feature/wallet/FiatAmount'
import SvgImage from '../components/ui/SvgImage'
import { useBridge } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmReceiveOffline'
>

const ConfirmReceiveOffline: React.FC<Props> = ({
    route,
    navigation,
}: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { receiveEcash, validateEcash } = useBridge()
    const toast = useToast()
    const { ecash } = route.params
    const [amount, setAmount] = useState(0 as MSats)
    const [error, setError] = useState<Error>()
    const [note, setNote] = useState('')
    const [receiving, setReceiving] = useState(false)

    useEffect(() => {
        validateEcash(ecash)
            .then(({ amount: amt }) => setAmount(amt))
            .catch(() => {
                setError(new Error('errors.invalid-ecash-token'))
            })
    }, [ecash, validateEcash])

    useEffect(() => {
        if (error) {
            toast.error(t, error, 'errors.invalid-ecash-token')
        }
    }, [error, t, toast])

    const onReceive = async () => {
        // Don't call multiple times
        if (!receiving) {
            setReceiving(true)
            try {
                await receiveEcash(ecash)
                setReceiving(false)
                navigation.navigate('ReceiveSuccess', {
                    // TODO: Fill out other fields? Missing some required Transaction fields.
                    tx: {
                        amount,
                    } as Transaction,
                })
            } catch (e) {
                toast.error(t, e)
                setReceiving(false)
            }
        }
    }

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
