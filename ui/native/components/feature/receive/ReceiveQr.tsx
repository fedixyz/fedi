import Clipboard from '@react-native-clipboard/clipboard'
import { useNavigation } from '@react-navigation/native'
import { Button, Card, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, Share, StyleSheet } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { useToast } from '@fedi/common/hooks/toast'
import { selectActiveFederationId } from '@fedi/common/redux'
import { updateTransactionNotes } from '@fedi/common/redux/transactions'
import stringUtils from '@fedi/common/utils/StringUtils'
import { makeLog } from '@fedi/common/utils/log'

import { Images } from '../../../assets/images'
import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { reset } from '../../../state/navigation'
import { BitcoinOrLightning, BtcLnUri, TransactionEvent } from '../../../types'
import Flex from '../../ui/Flex'
import NotesInput from '../../ui/NotesInput'
import OnchainDepositInfo from './OnchainDepositInfo'

const log = makeLog('ReceiveQr')

export type ReceiveQrProps = {
    uri: BtcLnUri
    type?: BitcoinOrLightning
    transactionId?: string
}

const QR_CODE_SIZE = Dimensions.get('window').width * 0.7

const ReceiveQr: React.FC<ReceiveQrProps> = ({
    uri,
    type,
    transactionId,
}: ReceiveQrProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation()
    const toast = useToast()
    const [notes, setNotes] = useState('')
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)

    const onSaveNotes = useCallback(async () => {
        if (!transactionId || !activeFederationId) return
        try {
            await dispatch(
                updateTransactionNotes({
                    fedimint,
                    notes,
                    federationId: activeFederationId,
                    transactionId,
                }),
            ).unwrap()
        } catch (err) {
            toast.error(t, err)
        }
    }, [activeFederationId, dispatch, notes, t, toast, transactionId])

    const copyToClipboard = () => {
        if (!uri.body) return

        Clipboard.setString(uri.body)
        toast.show({
            content: t('feature.receive.copied-payment-code'),
            status: 'success',
        })
    }

    const openShareDialog = async () => {
        // open share dialog
        try {
            if (!uri.fullString)
                throw new Error(
                    'Share Dialog could not be opened since uri.fullString is undefined',
                )

            const result = await Share.share({
                message: uri.fullString,
            })
            log.info('openShareDialog result', result)
        } catch (error) {
            log.error('openShareDialog', error)
        }
    }

    const transactionEventHandler = useCallback(
        (event: TransactionEvent) => {
            if (
                (event.transaction.kind === 'lnReceive' &&
                    event.transaction.ln_invoice === uri.body) ||
                (event.transaction.kind === 'onchainDeposit' &&
                    event.transaction.onchain_address === uri.body)
            )
                navigation.dispatch(
                    reset('ReceiveSuccess', {
                        tx: event.transaction,
                    }),
                )
        },
        [navigation, uri.body],
    )

    // Registers an event handler listening for the invoice to be paid
    useEffect(() => {
        const unsubscribe = fedimint.addListener(
            'transaction',
            transactionEventHandler,
        )
        return unsubscribe
    }, [transactionEventHandler])

    const style = styles(theme)

    return (
        <Flex grow justify="between" gap="xl">
            <Flex grow center gap="lg" style={style.content}>
                <Card containerStyle={style.qrCard}>
                    {uri.fullString && (
                        <Flex center>
                            <QRCode
                                value={uri.fullString}
                                size={QR_CODE_SIZE}
                                logo={Images.FediQrLogo}
                            />
                        </Flex>
                    )}

                    <Flex align="center" style={style.uriContainer}>
                        <Text style={style.uri} numberOfLines={1} small>
                            {stringUtils.truncateMiddleOfString(uri.body, 6)}
                        </Text>
                    </Flex>
                </Card>
                {type === BitcoinOrLightning.bitcoin && (
                    <NotesInput
                        notes={notes}
                        setNotes={setNotes}
                        onSave={onSaveNotes}
                    />
                )}
                {type === BitcoinOrLightning.bitcoin && <OnchainDepositInfo />}
            </Flex>
            <Flex row justify="between" fullWidth>
                <Button
                    title={t('words.share')}
                    onPress={openShareDialog}
                    containerStyle={style.button}
                />
                <Button
                    title={t('words.copy')}
                    onPress={copyToClipboard}
                    containerStyle={style.button}
                />
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        content: {
            paddingHorizontal: theme.spacing.lg,
        },
        button: {
            width: '48%',
        },
        uri: {
            lineHeight: 18,
        },
        uriContainer: {
            paddingTop: theme.spacing.md,
        },
        qrCard: {
            display: 'flex',
            borderRadius: 15,
            width: '100%',
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.xl,
            paddingBottom: theme.spacing.xs,
        },
    })

export default ReceiveQr
