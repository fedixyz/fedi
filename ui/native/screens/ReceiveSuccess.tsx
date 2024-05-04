import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import amountUtils from '@fedi/common/utils/AmountUtils'

import Success from '../components/ui/Success'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'ReceiveSuccess'>

const ReceiveSuccess: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { tx } = route.params

    const style = styles(theme)

    return (
        <Success
            message={
                <View style={style.textContainer}>
                    <Text h2Style={style.successMessage} h2>
                        {t(
                            tx.bitcoin
                                ? 'feature.receive.pending-transaction'
                                : 'feature.receive.you-received',
                        )}
                    </Text>
                    <Text h2Style={style.successMessage} h2>
                        {`${amountUtils.formatNumber(
                            amountUtils.msatToSat(tx.amount),
                        )} ${t('words.sats').toUpperCase()}`}
                    </Text>
                </View>
            }
            buttonText={t('words.done')}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        textContainer: {
            marginVertical: theme.spacing.md,
            width: '80%',
            alignItems: 'center',
        },
        successMessage: {
            textAlign: 'center',
        },
    })

export default ReceiveSuccess
