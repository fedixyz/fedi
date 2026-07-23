import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet } from 'react-native'

import { useBtcFiatPrice } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectIsInternetUnreachable,
    selectSelectedFederation,
} from '@fedi/common/redux'
import { ParserDataType, Sats, UsdCents } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { lnurlPay } from '@fedi/common/utils/lnurl'
import { makeLog } from '@fedi/common/utils/log'
import { parseUserInput } from '@fedi/common/utils/parser'

import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

const log = makeLog('native/screens/MerchantCatalogOrder')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MerchantCatalogOrder'
>

// Wire format uses short keys to keep the QR compact (see MerchantCatalogShare).
type WireItem = { n: string; c: number }
type OrderItem = { name: string; priceCents: number }
type CatalogPayload = { v: number; l?: string; i: WireItem[] }

function decodeCatalog(d?: string): CatalogPayload | null {
    if (!d) return null
    try {
        const parsed = JSON.parse(d)
        if (parsed && Array.isArray(parsed.i)) return parsed as CatalogPayload
        return null
    } catch {
        return null
    }
}

const MerchantCatalogOrder: React.FC<Props> = ({ route }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const fedimint = useFedimint()

    const selectedFederation = useAppSelector(selectSelectedFederation)
    const federationId = selectedFederation?.id
    const isOffline = useAppSelector(selectIsInternetUnreachable)
    const { convertCentsToSats, convertCentsToFormattedFiat } = useBtcFiatPrice(
        undefined,
        federationId,
    )

    const payload = useMemo(() => decodeCatalog(route.params?.d), [route.params])
    const items: OrderItem[] = useMemo(
        () => (payload?.i ?? []).map(it => ({ name: it.n, priceCents: it.c })),
        [payload],
    )
    const merchantLnurl = payload?.l

    const [cart, setCart] = useState<Record<number, number>>({})
    const [isPaying, setIsPaying] = useState(false)

    const totalCents = useMemo(
        () =>
            items.reduce(
                (sum, item, idx) => sum + item.priceCents * (cart[idx] ?? 0),
                0,
            ) as UsdCents,
        [cart, items],
    )
    const itemCount = useMemo(
        () => Object.values(cart).reduce((a, b) => a + b, 0),
        [cart],
    )
    const totalSats = convertCentsToSats(totalCents)

    const addItem = (idx: number) =>
        setCart(c => ({ ...c, [idx]: (c[idx] ?? 0) + 1 }))

    const removeItem = (idx: number) =>
        setCart(c => {
            const nextQty = (c[idx] ?? 0) - 1
            const updated = { ...c }
            if (nextQty <= 0) {
                delete updated[idx]
            } else {
                updated[idx] = nextQty
            }
            return updated
        })

    const handlePay = useCallback(async () => {
        if (itemCount === 0 || totalSats <= 0 || !federationId) return
        if (!merchantLnurl) {
            toast.error(t, t('feature.merchant.payment-unavailable'))
            return
        }
        setIsPaying(true)
        try {
            const parsed = await parseUserInput(
                merchantLnurl,
                fedimint,
                t,
                federationId,
                isOffline,
            )
            if (parsed.type !== ParserDataType.LnurlPay) {
                throw new Error(t('feature.merchant.payment-unavailable'))
            }
            const notes = items
                .filter((_, idx) => cart[idx])
                .map((item, idx) => `${cart[idx]}× ${item.name}`)
                .join(', ')
            const result = await lnurlPay(
                fedimint,
                federationId,
                parsed.data,
                amountUtils.satToMsat(totalSats as Sats),
                notes,
            )
            result.match(
                () => {
                    toast.show({
                        content: t('feature.merchant.payment-sent'),
                        status: 'success',
                    })
                    setCart({})
                    navigation.goBack()
                },
                err => {
                    log.error('Merchant catalog lnurl pay failed', err)
                    toast.error(t, err)
                },
            )
        } catch (e) {
            toast.error(t, e)
        } finally {
            setIsPaying(false)
        }
    }, [
        itemCount,
        totalSats,
        federationId,
        merchantLnurl,
        fedimint,
        t,
        isOffline,
        items,
        cart,
        toast,
        navigation,
    ])

    const style = styles(theme)

    if (!payload) {
        return (
            <SafeAreaContainer edges="notop" style={style.center}>
                <Text caption center color={theme.colors.grey}>
                    {t('feature.merchant.invalid-catalog')}
                </Text>
            </SafeAreaContainer>
        )
    }

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <ScrollView
                style={style.list}
                contentContainerStyle={style.listContent}
                showsVerticalScrollIndicator={false}>
                <Text caption color={theme.colors.grey} style={style.hint}>
                    {t('feature.merchant.tap-to-add')}
                </Text>
                {items.map((item, idx) => {
                    const qty = cart[idx] ?? 0
                    const selected = qty > 0
                    return (
                        <Row
                            key={`${item.name}-${idx}`}
                            align="center"
                            gap="md"
                            style={[style.row, selected && style.rowSelected]}>
                            <Pressable
                                style={style.rowMain}
                                onPress={() => addItem(idx)}>
                                <Column gap="xs">
                                    <Text medium>{item.name}</Text>
                                    <Text small color={theme.colors.darkGrey}>
                                        {convertCentsToFormattedFiat(
                                            item.priceCents as UsdCents,
                                        )}
                                    </Text>
                                </Column>
                            </Pressable>
                            {selected ? (
                                <Row align="center" gap="md">
                                    <Pressable
                                        hitSlop={8}
                                        style={style.stepButton}
                                        onPress={() => removeItem(idx)}>
                                        <SvgImage
                                            name="Minus"
                                            size="xs"
                                            color={theme.colors.primary}
                                        />
                                    </Pressable>
                                    <Text bold style={style.qty}>
                                        {qty}
                                    </Text>
                                    <Pressable
                                        hitSlop={8}
                                        style={style.stepButton}
                                        onPress={() => addItem(idx)}>
                                        <SvgImage
                                            name="Plus"
                                            size="xs"
                                            color={theme.colors.primary}
                                        />
                                    </Pressable>
                                </Row>
                            ) : (
                                <Pressable
                                    hitSlop={8}
                                    style={style.addButton}
                                    onPress={() => addItem(idx)}>
                                    <SvgImage
                                        name="Plus"
                                        size="xs"
                                        color={theme.colors.primary}
                                    />
                                </Pressable>
                            )}
                        </Row>
                    )
                })}
            </ScrollView>

            <Column gap="md" fullWidth style={style.footer}>
                <Row align="center" justify="between" fullWidth>
                    <Row align="center" gap="sm">
                        <SvgImage
                            name="Cash"
                            size="sm"
                            color={theme.colors.darkGrey}
                        />
                        <Text medium color={theme.colors.darkGrey}>
                            {itemCount}
                        </Text>
                    </Row>
                    <Column align="end" gap="xs">
                        <Text h2 bold>
                            {convertCentsToFormattedFiat(totalCents)}
                        </Text>
                        <Text small color={theme.colors.grey}>
                            {`${totalSats} ${t('words.sats').toUpperCase()}`}
                        </Text>
                    </Column>
                </Row>
                <Button
                    testID="CatalogPayButton"
                    title={
                        itemCount > 0
                            ? `${t('words.pay')} ${convertCentsToFormattedFiat(
                                  totalCents,
                              )}`
                            : t('feature.merchant.select-products')
                    }
                    onPress={handlePay}
                    disabled={itemCount === 0 || isPaying}
                    loading={isPaying}
                    containerStyle={style.fullWidth}
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
        list: {
            flex: 1,
        },
        listContent: {
            paddingVertical: theme.spacing.sm,
            gap: theme.spacing.sm,
        },
        hint: {
            paddingBottom: theme.spacing.sm,
        },
        row: {
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
            borderRadius: theme.borders.defaultRadius,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
        },
        rowSelected: {
            borderColor: theme.colors.primary,
        },
        rowMain: {
            flex: 1,
        },
        addButton: {
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
            alignItems: 'center',
            justifyContent: 'center',
        },
        stepButton: {
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        qty: {
            minWidth: 20,
            textAlign: 'center',
        },
        footer: {
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: theme.colors.lightGrey,
        },
        fullWidth: {
            width: '100%',
        },
    })

export default MerchantCatalogOrder
