import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import { RpcInvoice } from '@fedi/common/types/bindings'
import { coerceTxn } from '@fedi/common/utils/transaction'

import ReceiveQr from '../components/feature/receive/ReceiveQr'
import PaymentType from '../components/feature/send/PaymentType'
import SendAmounts from '../components/feature/send/SendAmounts'
import { Column } from '../components/ui/Flex'
import NotesInput from '../components/ui/NotesInput'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { reset } from '../state/navigation'
import { BitcoinOrLightning, BtcLnUri, MSats } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'LightningRequestQr'
>

const LightningRequestQr: React.FC<Props> = ({ route, navigation }: Props) => {
    const { theme } = useTheme()
    const { invoice, memo, federationId } = route.params
    const fedimint = useFedimint()

    const [isDecodingInvoice, setIsDecodingInvoice] = useState(true)
    const [decoded, setDecoded] = useState<RpcInvoice | null>(null)
    const [notes, setNotes] = useState(memo ?? '')

    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId,
    })
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(decoded?.amount ?? (0 as MSats))
    const { fetchTransactions } = useTransactionHistory(federationId ?? '')

    const handleSaveNotes = useCallback(async () => {
        if (!notes || !federationId) return

        const transactions = await fetchTransactions()
        const invoiceTransaction = transactions.find(
            tx => tx.kind === 'lnReceive' && tx.ln_invoice === invoice,
        )

        await fedimint.updateTransactionNotes(
            invoiceTransaction?.id ?? '',
            notes,
            federationId,
        )
    }, [fedimint, fetchTransactions, invoice, federationId, notes])

    useEffect(() => {
        fedimint
            .decodeInvoice(invoice)
            .then(setDecoded)
            .finally(() => setIsDecodingInvoice(false))
    }, [invoice, fedimint])

    useEffect(() => {
        if (!federationId) return

        const unsubscribe = fedimint.addListener(
            'transaction',
            ({ transaction }) => {
                const tx = coerceTxn(transaction)

                if (tx.kind === 'lnReceive' && tx.ln_invoice === invoice)
                    navigation.dispatch(
                        reset('ReceiveSuccess', {
                            tx,
                        }),
                    )
            },
        )

        return unsubscribe
    }, [invoice, fedimint, navigation, federationId])

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
                    formattedPrimaryAmount={
                        isDecodingInvoice ? '--' : formattedPrimaryAmount
                    }
                    formattedSecondaryAmount={
                        isDecodingInvoice ? '--' : formattedSecondaryAmount
                    }
                />
            </Column>
            <ReceiveQr uri={uri}>
                <NotesInput
                    notes={notes}
                    setNotes={setNotes}
                    onSave={handleSaveNotes}
                />
            </ReceiveQr>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        amounts: {
            paddingVertical: theme.spacing.xl,
        },
        container: {
            flex: 1,
            gap: theme.spacing.lg,
        },
        scrollContainer: {
            gap: theme.spacing.lg,
            alignItems: 'center',
        },
    })

export default LightningRequestQr
