import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import { useLnurlReceiveCode } from '@fedi/common/hooks/receive'
import {
    selectIsInternetUnreachable,
    selectPaymentFederation,
} from '@fedi/common/redux'

import InternetUnreachableBanner from '../components/feature/environment/InternetUnreachableBanner'
import LnurlReceiveQr from '../components/feature/receive/LnurlReceiveQr'
import OnchainReceiveQr from '../components/feature/receive/OnchainReceiveQr'
import RequestLightningAmount from '../components/feature/receive/RequestLightningAmount'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { Switcher } from '../components/ui/Switcher'
import { useAppSelector } from '../state/hooks'
import { BitcoinOrLightning } from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<RootStackParamList, 'ReceiveBitcoin'>

const ReceiveBitcoin: React.FC<Props> = () => {
    const federationId = useAppSelector(selectPaymentFederation)?.id ?? ''

    const [activeTab, setActiveTab] = useState<BitcoinOrLightning>(
        BitcoinOrLightning.lightning,
    )
    const [generatedOnchainAddress, setGeneratedOnchainAddress] = useState<
        string | null
    >(null)

    const { t } = useTranslation()
    const { theme } = useTheme()

    const { supportsLnurl } = useLnurlReceiveCode(federationId)

    const isOnchainSupported = useIsOnchainDepositSupported(federationId)
    const isOffline = useAppSelector(selectIsInternetUnreachable)

    // Setup switcher options
    const switcherOptions: Array<{
        label: string
        value: BitcoinOrLightning
    }> = [
        {
            label: t('words.lightning'),
            value: BitcoinOrLightning.lightning,
        },
    ]

    if (supportsLnurl) {
        switcherOptions.push({
            label: t('words.lnurl'),
            value: BitcoinOrLightning.lnurl,
        })
    }

    if (isOnchainSupported) {
        switcherOptions.push({
            label: t('words.onchain'),
            value: BitcoinOrLightning.bitcoin,
        })
    }

    useEffect(() => {
        if (
            typeof supportsLnurl !== 'boolean' ||
            typeof isOnchainSupported !== 'boolean'
        )
            return
        if (
            (activeTab === BitcoinOrLightning.lnurl && !supportsLnurl) ||
            (activeTab === BitcoinOrLightning.bitcoin && !isOnchainSupported)
        ) {
            setActiveTab(BitcoinOrLightning.lightning)
        }
    }, [activeTab, supportsLnurl, isOnchainSupported])

    useSyncCurrencyRatesOnFocus(federationId)

    return (
        <>
            {isOffline && <InternetUnreachableBanner />}
            <SafeAreaContainer
                edges="bottom"
                padding="xl"
                style={{ gap: theme.spacing.xl }}>
                <View
                    style={{
                        marginTop: theme.spacing.lg,
                        paddingHorizontal: theme.spacing.xl,
                        gap: theme.spacing.sm,
                    }}>
                    {(isOnchainSupported || supportsLnurl) && (
                        <Switcher<BitcoinOrLightning>
                            options={switcherOptions}
                            selected={activeTab}
                            onChange={setActiveTab}
                        />
                    )}
                    <FederationWalletSelector fullWidth />
                </View>
                {activeTab === BitcoinOrLightning.bitcoin && (
                    <OnchainReceiveQr
                        generatedOnchainAddress={generatedOnchainAddress}
                        setGeneratedOnchainAddress={setGeneratedOnchainAddress}
                        federationId={federationId}
                    />
                )}
                {activeTab === BitcoinOrLightning.lnurl && (
                    <LnurlReceiveQr federationId={federationId} />
                )}
                {activeTab === 'lightning' && (
                    <RequestLightningAmount federationId={federationId} />
                )}
            </SafeAreaContainer>
        </>
    )
}

export default ReceiveBitcoin
