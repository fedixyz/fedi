import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useIsOfflineWalletSupported } from '@fedi/common/hooks/federation'
import { setPayFromFederationId } from '@fedi/common/redux/federation'

import {
    OmniInput,
    OmniInputAction,
} from '../components/feature/omni/OmniInput'
import { Column } from '../components/ui/Flex'
import { useAppDispatch } from '../state/hooks'
import { ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<RootStackParamList, 'Send'>

const Send: React.FC<Props> = ({ navigation, route }: Props) => {
    const { federationId = '' } = route.params
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const showOfflineWallet = useIsOfflineWalletSupported(federationId)

    const { navigate } = navigation

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

    useSyncCurrencyRatesOnFocus(federationId)

    return (
        <Column grow fullWidth>
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
        </Column>
    )
}

export default Send
