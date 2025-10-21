import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'

import { selectCurrency } from '@fedi/common/redux'
import { RpcInvoice } from '@fedi/common/types/bindings'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { getCurrencyCode } from '@fedi/common/utils/currency'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import FiatAmount from '../components/feature/wallet/FiatAmount'
import Flex from '../components/ui/Flex'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { BitcoinOrLightning, BtcLnUri } from '../types'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('BitcoinRequest')

export type Props = NativeStackScreenProps<RootStackParamList, 'BitcoinRequest'>

const BitcoinRequest: React.FC<Props> = ({ route }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { invoice, federationId = null } = route.params

    const [isLoading, setIsLoading] = useState<boolean>(true)
    const [decoded, setDecoded] = useState<RpcInvoice | null>(null)
    const selectedFiatCurrency = useAppSelector(s =>
        selectCurrency(s, federationId ?? undefined),
    )

    useEffect(() => {
        fedimint
            .rpcResult('decodeInvoice', { invoice, federationId })
            .match(
                inv => setDecoded(inv),
                err => log.error('error decoding invoice', err),
            )
            .finally(() => setIsLoading(false))
    }, [invoice, federationId])

    if (isLoading) {
        return (
            <Flex grow center>
                <ActivityIndicator />
            </Flex>
        )
    }

    const style = styles(theme)

    return (
        <SafeScrollArea contentContainerStyle={style.container} edges="all">
            {decoded ? (
                <Flex center style={style.detailsContainer}>
                    <Text h2>{`${amountUtils.formatNumber(
                        amountUtils.msatToSat(decoded.amount),
                    )} ${t('words.sats').toUpperCase()}`}</Text>
                    <FiatAmount
                        amountSats={amountUtils.msatToSat(decoded.amount)}
                        federationId={federationId ?? undefined}
                    />
                    {decoded.description && (
                        <Text small>{decoded.description}</Text>
                    )}
                </Flex>
            ) : (
                <Flex center style={style.errorContainer}>
                    <Text h2>{`- ${t('words.sats').toUpperCase()}`}</Text>
                    <Text medium color={theme.colors.darkGrey}>
                        {`- ${getCurrencyCode(selectedFiatCurrency)}`}
                    </Text>
                    <Text small color={theme.colors.red}>
                        {t('phrases.failed-to-decode-invoice')}
                    </Text>
                </Flex>
            )}
            <ReceiveQr
                uri={
                    new BtcLnUri({
                        type: BitcoinOrLightning.lightning,
                        body: invoice,
                        paramsString: null,
                    })
                }
                type={BitcoinOrLightning.lightning}
                federationId={federationId || ''}
            />
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        detailsContainer: {
            paddingVertical: theme.spacing.md,
        },
        errorContainer: {
            paddingVertical: theme.spacing.md,
        },
    })

export default BitcoinRequest
