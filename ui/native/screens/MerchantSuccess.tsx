import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { reset, resetToWallets } from '../state/navigation'
import type { NavigationHook, RootStackParamList } from '../types/navigation'
import { Column } from '../components/ui/Flex'
import Success from '../components/ui/Success'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MerchantSuccess'
>

const MerchantSuccess: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { amountSats, federationId } = route.params
    const navigation = useNavigation<NavigationHook>()

    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId,
    })
    const amountMSats = amountUtils.satToMsat(amountSats)
    const { formattedPrimaryAmount } =
        makeFormattedAmountsFromMSats(amountMSats)

    return (
        <Success
            message={
                <Column align="center" gap="sm">
                    <Text center h2>
                        {t('feature.merchant.sale-received')}
                    </Text>
                    <Text center h2>
                        {formattedPrimaryAmount}
                    </Text>
                </Column>
            }
            button={
                <Column gap="sm" fullWidth>
                    <Button
                        title={t('feature.merchant.new-sale')}
                        onPress={() =>
                            navigation.dispatch(
                                reset('MerchantAmount', { federationId }),
                            )
                        }
                    />
                    <Button
                        title={t('words.done')}
                        type="outline"
                        onPress={() => navigation.dispatch(resetToWallets())}
                    />
                </Column>
            }
        />
    )
}

export default MerchantSuccess
