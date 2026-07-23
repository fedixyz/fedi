import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect } from 'react'
import { StyleSheet } from 'react-native'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { coerceTxn } from '@fedi/common/utils/transaction'

import ReceiveQr from '../components/feature/receive/ReceiveQr'
import PaymentType from '../components/feature/send/PaymentType'
import SendAmounts from '../components/feature/send/SendAmounts'
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { BitcoinOrLightning, BtcLnUri } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'MerchantQr'>

const MerchantQr: React.FC<Props> = ({ route, navigation }: Props) => {
    const { theme } = useTheme()
    const { invoice, amountSats, federationId } = route.params
    const fedimint = useFedimint()

    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId,
    })
    const amountMSats = amountUtils.satToMsat(amountSats)
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(amountMSats)

    useEffect(() => {
        if (!federationId) return

        const unsubscribe = fedimint.addListener(
            'transaction',
            ({ transaction }) => {
                const tx = coerceTxn(transaction)
                if (tx.kind === 'lnReceive' && tx.ln_invoice === invoice) {
                    navigation.navigate('MerchantSuccess', {
                        amountSats,
                        federationId,
                    })
                }
            },
        )
        return unsubscribe
    }, [invoice, amountSats, fedimint, navigation, federationId])

    const uri = new BtcLnUri({
        type: BitcoinOrLightning.lightning,
        body: invoice,
    })

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="bottom" padding="xl" style={style.container}>
            <Column align="center" style={style.amounts}>
                <PaymentType type="lightning" />
                <SendAmounts
                    formattedPrimaryAmount={formattedPrimaryAmount}
                    formattedSecondaryAmount={formattedSecondaryAmount}
                />
            </Column>
            <ReceiveQr uri={uri} />
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            gap: theme.spacing.lg,
        },
        amounts: {
            paddingVertical: theme.spacing.xl,
        },
    })

export default MerchantQr
