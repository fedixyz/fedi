import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { OmniInput } from '../components/feature/omni/OmniInput'
import { Column } from '../components/ui/Flex'
import { ParserDataType } from '../types'
import { NavigationHook, RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<RootStackParamList, 'Receive'>

const Receive: React.FC<Props> = ({ route }) => {
    const { t } = useTranslation()
    const { federationId = '' } = route.params
    const navigation = useNavigation<NavigationHook>()

    useSyncCurrencyRatesOnFocus(federationId)
    return (
        <Column grow fullWidth>
            <OmniInput
                expectedInputTypes={[
                    ParserDataType.LnurlWithdraw,
                    ParserDataType.FedimintEcash,
                    ParserDataType.FediChatUser,
                ]}
                onExpectedInput={parsedData => {
                    if (parsedData.type === ParserDataType.LnurlWithdraw) {
                        navigation.navigate('RedeemLnurlWithdraw', {
                            parsedData,
                        })
                    } else if (
                        parsedData.type === ParserDataType.FedimintEcash
                    ) {
                        navigation.navigate('ConfirmReceiveOffline', {
                            ecash: parsedData.data.token,
                        })
                    } else if (
                        parsedData.type === ParserDataType.FediChatUser
                    ) {
                        navigation.navigate('ChatWallet', {
                            recipientId: parsedData.data.id,
                        })
                    }
                }}
                onUnexpectedSuccess={() => {
                    navigation.canGoBack()
                        ? navigation.goBack()
                        : navigation.navigate('TabsNavigator', {
                              initialRouteName: 'Federations',
                          })
                }}
                customActions={[
                    {
                        label: t('feature.receive.add-amount'),
                        icon: 'Plus',
                        onPress: () =>
                            navigation.navigate('ReceiveLightning', {
                                federationId,
                            }),
                    },
                ]}
            />
        </Column>
    )
}

export default Receive
