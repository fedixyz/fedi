import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useTheme, Text } from '@rneui/themed'
import React, { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

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
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { Option, Switcher } from '../components/ui/Switcher'
import { useAppSelector } from '../state/hooks'
import { BitcoinOrLightning } from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<RootStackParamList, 'ReceiveBitcoin'>

const ReceiveBitcoin: React.FC<Props> = () => {
    const federation = useAppSelector(selectPaymentFederation)
    const federationId = federation?.id ?? ''

    const [activeTab, setActiveTab] = useState<BitcoinOrLightning>(
        BitcoinOrLightning.lightning,
    )
    const [generatedOnchainAddress, setGeneratedOnchainAddress] = useState<{
        federationId: string
        address: string
    } | null>(null)

    const { t } = useTranslation()
    const { theme } = useTheme()

    const { supportsLnurl } = useLnurlReceiveCode(federationId)

    const isOnchainSupported = useIsOnchainDepositSupported(federationId)
    const isOffline = useAppSelector(selectIsInternetUnreachable)

    // Setup switcher options
    const switcherOptions: Option<BitcoinOrLightning>[] = useMemo(
        () => [
            {
                label: t('words.lightning'),
                value: BitcoinOrLightning.lightning,
            },
            {
                label: t('words.lnurl'),
                value: BitcoinOrLightning.lnurl,
                disabled: !supportsLnurl,
                disabledMessage: (
                    <Text caption>
                        <Trans
                            t={t}
                            i18nKey="feature.receive.lnurl-unsupported-by-federation"
                            components={{
                                bold: <Text caption bold />,
                            }}
                            values={{ federationName: federation?.name }}
                        />
                    </Text>
                ),
            },
            {
                label: t('words.onchain'),
                value: BitcoinOrLightning.bitcoin,
                disabled: !isOnchainSupported,
                disabledMessage: (
                    <Text caption>
                        <Trans
                            t={t}
                            i18nKey="feature.receive.onchain-deposits-disabled-by-federation"
                            components={{
                                bold: <Text caption bold />,
                            }}
                            values={{ federationName: federation?.name }}
                        />
                    </Text>
                ),
            },
        ],
        [t, supportsLnurl, isOnchainSupported, federation],
    )

    useEffect(() => {
        if (
            (activeTab === BitcoinOrLightning.lnurl &&
                supportsLnurl === false) ||
            (activeTab === BitcoinOrLightning.bitcoin &&
                isOnchainSupported === false)
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
                <Column
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
                </Column>
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
