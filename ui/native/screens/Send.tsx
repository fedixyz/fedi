import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useIsOfflineWalletSupported } from '@fedi/common/hooks/federation'

import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import { ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'Send'>

const Send: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const showOfflineWallet = useIsOfflineWalletSupported()

    const { navigate } = navigation

    const customActions: OmniInputAction[] = useMemo(() => {
        if (!showOfflineWallet) return []
        return [
            {
                label: t('feature.send.send-offline'),
                icon: 'Offline',
                onPress: () => navigate('SendOfflineAmount'),
            },
        ]
    }, [showOfflineWallet, t, navigate])

    return (
        <View style={styles().container}>
            <OmniInput
                expectedInputTypes={[
                    ParserDataType.Bolt11,
                    ParserDataType.LnurlPay,
                    ParserDataType.FediChatUser,
                    ParserDataType.Bip21,
                    ParserDataType.BitcoinAddress,
                ]}
                onExpectedInput={parsedData => {
                    if (parsedData.type === ParserDataType.FediChatUser) {
                        navigate('ChatWallet', {
                            recipientId: parsedData.data.id,
                        })
                    } else if (
                        parsedData.type === ParserDataType.Bip21 ||
                        parsedData.type === ParserDataType.BitcoinAddress
                    ) {
                        navigate('SendOnChainAmount', {
                            parsedData,
                        })
                    } else {
                        navigate('ConfirmSendLightning', { parsedData })
                    }
                }}
                onUnexpectedSuccess={() => null}
                customActions={customActions}
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

export default Send
