import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { useIsOfflineWalletSupported } from '@fedi/common/hooks/federation'
import { setPayFromFederationId } from '@fedi/common/redux/federation'

import { fedimint } from '../bridge'
import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import Flex from '../components/ui/Flex'
import { useAppDispatch } from '../state/hooks'
import { ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'Send'>

const Send: React.FC<Props> = ({ navigation, route }: Props) => {
    const { federationId = '' } = route.params
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const showOfflineWallet = useIsOfflineWalletSupported(federationId)

    const { navigate } = navigation
    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache(fedimint)

    const customActions: OmniInputAction[] = useMemo(() => {
        if (!showOfflineWallet) return []
        return [
            {
                label: t('feature.send.send-offline'),
                icon: 'Offline',
                onPress: async () => {
                    // set payment federation first, then navigate
                    if (federationId) {
                        await dispatch(setPayFromFederationId(federationId))
                    }
                    navigate('SendOfflineAmount')
                },
            },
        ]
    }, [showOfflineWallet, t, navigate, dispatch, federationId])

    useFocusEffect(
        useCallback(() => {
            syncCurrencyRatesAndCache()
        }, [syncCurrencyRatesAndCache]),
    )

    return (
        <Flex grow fullWidth>
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
        </Flex>
    )
}

export default Send
