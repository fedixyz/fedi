import Clipboard from '@react-native-clipboard/clipboard'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share, StyleSheet } from 'react-native'

import { useLnurlReceiveCode } from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { selectSelectedFederation } from '@fedi/common/redux'

import { Column } from '../components/ui/Flex'
import QRCode from '../components/ui/QRCode'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { loadMerchantCatalog, MerchantProduct } from '../utils/merchantCatalog'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MerchantCatalogShare'
>

/**
 * Encode the catalog (and the merchant's LNURL, when available) into a Fedi
 * universal deeplink. Scanning it routes to `MerchantCatalogOrder` via the
 * standard deeplink → screenMap path. Short keys keep the QR compact.
 */
export function buildCatalogUrl(
    items: MerchantProduct[],
    lnurl: string | null,
): string {
    const payload = {
        v: 1,
        ...(lnurl ? { l: lnurl } : {}),
        i: items.map(p => ({ n: p.name, c: p.priceCents })),
    }
    const params = new URLSearchParams({
        screen: 'merchant-catalog',
        d: JSON.stringify(payload),
    })
    return `https://app.fedi.xyz/link?${params.toString()}`
}

const MerchantCatalogShare: React.FC<Props> = ({ route }) => {
    const selectedFederation = useAppSelector(selectSelectedFederation)
    const federationId = route.params?.federationId || selectedFederation?.id

    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()

    const { lnurlReceiveCode, supportsLnurl } = useLnurlReceiveCode(
        federationId || '',
    )

    const [items, setItems] = useState<MerchantProduct[]>([])
    useEffect(() => {
        let active = true
        loadMerchantCatalog(federationId).then(loaded => {
            if (active) setItems(loaded)
        })
        return () => {
            active = false
        }
    }, [federationId])

    const url = useMemo(
        () => buildCatalogUrl(items, lnurlReceiveCode),
        [items, lnurlReceiveCode],
    )

    const handleCopy = () => {
        Clipboard.setString(url)
        toast.show(t('phrases.copied-to-clipboard'))
    }

    const handleShare = () => {
        Share.share({ message: url }).catch(e => toast.error(t, e))
    }

    const style = styles(theme)

    if (items.length === 0) {
        return (
            <SafeAreaContainer edges="notop" style={style.center}>
                <Text caption center color={theme.colors.grey}>
                    {t('feature.merchant.no-products')}
                </Text>
            </SafeAreaContainer>
        )
    }

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <Column align="center" justify="center" gap="lg" grow>
                <Text caption center color={theme.colors.darkGrey}>
                    {t('feature.merchant.scan-to-order')}
                </Text>
                <QRCode value={url} size={260} />
                {supportsLnurl === false && (
                    <Text small center color={theme.colors.red}>
                        {t('feature.merchant.payment-unavailable')}
                    </Text>
                )}
            </Column>
            <Column gap="md" fullWidth style={style.footer}>
                <Button title={t('words.share')} onPress={handleShare} />
                <Button
                    type="clear"
                    title={t('feature.merchant.copy-link')}
                    onPress={handleCopy}
                />
            </Column>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            paddingHorizontal: theme.spacing.lg,
        },
        center: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.lg,
        },
        footer: {
            paddingBottom: theme.spacing.sm,
        },
    })

export default MerchantCatalogShare
