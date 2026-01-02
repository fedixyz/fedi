import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'

import { OmniInput } from '../components/feature/omni/OmniInput'
import Flex from '../components/ui/Flex'
import { ParserDataType } from '../types'
import { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'Receive'>

const Receive: React.FC<Props> = ({ route }) => {
    const { t } = useTranslation()
    const { federationId = '' } = route.params
    const navigation = useNavigation<NavigationHook>()
    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache()

    useFocusEffect(
        useCallback(() => {
            syncCurrencyRatesAndCache(federationId)
        }, [syncCurrencyRatesAndCache, federationId]),
    )
    return (
        <Flex grow fullWidth>
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
        </Flex>
    )
}

export default Receive
