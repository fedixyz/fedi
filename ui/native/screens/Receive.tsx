/**
 * This screen is currently unused, users are taken directly to `ReceiveLightning`
 * instead. This is left for posterity for the moment, but if we stick with the
 * decision not to use the OmniInput for receive, this screen can be removed.
 */
import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { OmniInput } from '../components/feature/omni/OmniInput'
import { ParserDataType } from '../types'
import { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'Receive'>

const Receive: React.FC<Props> = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    return (
        <View style={styles().container}>
            <OmniInput
                expectedInputTypes={[
                    ParserDataType.LnurlWithdraw,
                    ParserDataType.FedimintEcash,
                    ParserDataType.FediChatMember,
                ]}
                onExpectedInput={parsedData => {
                    if (parsedData.type === ParserDataType.LnurlWithdraw) {
                        navigation.navigate('ReceiveLightning', { parsedData })
                    } else if (
                        parsedData.type === ParserDataType.FedimintEcash
                    ) {
                        navigation.navigate('ConfirmReceiveOffline', {
                            ecash: parsedData.data.token,
                        })
                    } else if (
                        parsedData.type === ParserDataType.FediChatMember
                    ) {
                        navigation.navigate('ChatWallet', {
                            recipientId: parsedData.data.id,
                        })
                    }
                }}
                onUnexpectedSuccess={() => {
                    navigation.canGoBack()
                        ? navigation.goBack()
                        : navigation.navigate('TabsNavigator')
                }}
                customActions={[
                    {
                        label: t('feature.receive.add-amount'),
                        icon: 'Plus',
                        onPress: () => navigation.navigate('ReceiveLightning'),
                    },
                ]}
            />
        </View>
    )
}

const styles = () =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
        },
    })

export default Receive
