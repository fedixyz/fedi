import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { t } from 'i18next'
import { dataToFrames } from 'qrloop'
import React, { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { useAmountFormatter } from '@fedi/common/hooks/amount'

import QRScreen from '../components/ui/QRScreen'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'SendOfflineQr'>

const SendOfflineQr: React.FC<Props> = ({ navigation, route }: Props) => {
    const { theme } = useTheme()
    const { ecash, amount } = route.params
    const [index, setIndex] = useState(0)
    const [unit] = useState('sats')
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    const frames = useMemo(() => {
        return dataToFrames(Buffer.from(ecash, 'base64'))
    }, [ecash])

    // show new qr every 100ms
    useEffect(() => {
        const interval = setInterval(() => {
            setIndex((index + 1) % frames.length)
        }, 100)
        return () => clearInterval(interval)
    }, [index, frames])

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(amount)
    const style = styles(theme)

    return (
        <QRScreen
            title={formattedPrimaryAmount}
            subtitle={formattedSecondaryAmount}
            qrValue={frames[index]}
            copyValue={ecash}
            copyMessage={t('phrases.copied-ecash-token')}
            bottom={
                <View style={style.actionContainer}>
                    <Text small style={style.instructionsText}>
                        {`${t('phrases.hold-to-confirm')}`}
                    </Text>
                    <Button
                        fullWidth
                        title={t('feature.send.i-have-sent-payment')}
                        onLongPress={() => {
                            navigation.navigate('SendSuccess', {
                                amount,
                                unit,
                            })
                        }}
                        delayLongPress={500}
                        containerStyle={style.buttonContainer}
                    />
                </View>
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        amountContainer: {
            flexDirection: 'row',
            alignItems: 'flex-end',
        },
        actionContainer: {
            marginTop: 'auto',
            width: '100%',
        },
        instructionsText: {
            textAlign: 'center',
            marginVertical: theme.spacing.md,
        },
        buttonContainer: {
            marginTop: 'auto',
            marginVertical: theme.spacing.xl,
        },
    })

export default SendOfflineQr
