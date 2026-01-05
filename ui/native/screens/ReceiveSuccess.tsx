import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeReceiveSuccessMessage } from '@fedi/common/utils/wallet'

import { Column } from '../components/ui/Flex'
import Success from '../components/ui/Success'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'ReceiveSuccess'>

const ReceiveSuccess: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { tx, status = 'success' } = route.params

    const { message, subtext } = makeReceiveSuccessMessage(t, tx, status)

    return (
        <Success
            message={
                <Column align="center" gap="sm">
                    <Text center h2>
                        {message}
                    </Text>
                    {subtext && <Text caption>{subtext}</Text>}
                    <Text center h2>
                        {`${amountUtils.formatNumber(
                            amountUtils.msatToSat(tx.amount),
                        )} ${t('words.sats').toUpperCase()}`}
                    </Text>
                </Column>
            }
            buttonText={t('words.done')}
            nextScreenProps={{ initialRouteName: 'Federations' }}
        />
    )
}

export default ReceiveSuccess
