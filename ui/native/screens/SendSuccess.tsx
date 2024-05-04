import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import amountUtils from '@fedi/common/utils/AmountUtils'

import Success from '../components/ui/Success'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'SendSuccess'>

const SendSuccess: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { amount, unit } = route.params

    return (
        <Success
            message={
                <>
                    <Text h2 style={styles(theme).messageText}>
                        {t('feature.send.you-sent')}
                    </Text>
                    <Text h2>
                        {`${amountUtils.formatNumber(
                            amountUtils.msatToSat(amount),
                        )} ${unit.toUpperCase()}`}
                    </Text>
                </>
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        messageText: {
            marginTop: theme.spacing.md,
        },
    })

export default SendSuccess
