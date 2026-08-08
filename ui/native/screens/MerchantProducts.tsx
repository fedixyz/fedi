import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet } from 'react-native'

import { useBtcFiatPrice } from '@fedi/common/hooks/amount'
import { useMakeLightningRequest } from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { selectSelectedFederation } from '@fedi/common/redux'
import { Sats, UsdCents } from '@fedi/common/types'

import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { loadMerchantCatalog, MerchantProduct } from '../utils/merchantCatalog'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'MerchantProducts'>

const MerchantProducts: React.FC<Props> = ({ route }) => {
    const selectedFederation = useAppSelector(selectSelectedFederation)
    const federationId = route.params?.federationId || selectedFederation?.id

    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()

    const { convertCentsToSats, convertCentsToFormattedFiat } = useBtcFiatPrice(
        undefined,
        federationId,
    )
    const { isInvoiceLoading, makeLightningRequest } = useMakeLightningRequest({
        federationId,
    })

    const [products, setProducts] = useState<MerchantProduct[]>([])
    // Map of product id -> quantity in the cart
    const [cart, setCart] = useState<Record<string, number>>({})

    // Reload the catalog whenever the screen regains focus so edits made on
    // the catalog editor are reflected here.
    useFocusEffect(
        useCallback(() => {
            let active = true
            loadMerchantCatalog(federationId).then(loaded => {
                if (active) setProducts(loaded)
            })
            return () => {
                active = false
            }
        }, [federationId]),
    )

    const totalCents = useMemo(
        () =>
            products.reduce(
                (sum, p) => sum + p.priceCents * (cart[p.id] ?? 0),
                0,
            ) as UsdCents,
        [cart, products],
    )
    const itemCount = useMemo(
        () => Object.values(cart).reduce((a, b) => a + b, 0),
        [cart],
    )
    const totalSats = convertCentsToSats(totalCents)

    const addItem = (id: string) =>
        setCart(c => ({ ...c, [id]: (c[id] ?? 0) + 1 }))

    const removeItem = (id: string) =>
        setCart(c => {
            const nextQty = (c[id] ?? 0) - 1
            const updated = { ...c }
            if (nextQty <= 0) {
                delete updated[id]
            } else {
                updated[id] = nextQty
            }
            return updated
        })

    const clearCart = () => setCart({})

    const handleCheckout = async () => {
        if (itemCount === 0 || totalSats <= 0) return

        const memo = products
            .filter(p => cart[p.id])
            .map(p => `${cart[p.id]}× ${p.name}`)
            .join(', ')

        try {
            const invoice = await makeLightningRequest(totalSats as Sats, memo)
            if (invoice) {
                navigation.navigate('MerchantQr', {
                    invoice,
                    amountSats: totalSats as Sats,
                    federationId,
                })
            }
        } catch (e) {
            toast.error(t, e)
        }
    }

    const goToEdit = () =>
        navigation.navigate('MerchantCatalogEdit', { federationId })

    const goToShare = () =>
        navigation.navigate('MerchantCatalogShare', { federationId })

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <Row align="center" justify="between" fullWidth style={style.topBar}>
                <Text caption color={theme.colors.grey}>
                    {t('feature.merchant.tap-to-add')}
                </Text>
                <Row align="center" gap="sm">
                    <Button
                        type="clear"
                        title={t('words.share')}
                        titleStyle={style.linkLabel}
                        icon={
                            <SvgImage
                                name="Scan"
                                size="xs"
                                color={theme.colors.darkGrey}
                            />
                        }
                        onPress={goToShare}
                    />
                    <Button
                        type="clear"
                        title={t('words.edit')}
                        titleStyle={style.linkLabel}
                        icon={
                            <SvgImage
                                name="Edit"
                                size="xs"
                                color={theme.colors.darkGrey}
                            />
                        }
                        onPress={goToEdit}
                    />
                </Row>
            </Row>
            <ScrollView
                style={style.list}
                contentContainerStyle={style.listContent}
                showsVerticalScrollIndicator={false}>
                {products.length === 0 ? (
                    <Column center gap="md" style={style.empty}>
                        <Text caption color={theme.colors.grey}>
                            {t('feature.merchant.no-products')}
                        </Text>
                        <Button
                            title={t('feature.merchant.add-product')}
                            onPress={goToEdit}
                        />
                    </Column>
                ) : (
                    products.map(product => {
                        const qty = cart[product.id] ?? 0
                        const selected = qty > 0
                        return (
                            <Row
                                key={product.id}
                                align="center"
                                gap="md"
                                style={[style.row, selected && style.rowSelected]}>
                                <Pressable
                                    style={style.rowMain}
                                    onPress={() => addItem(product.id)}>
                                    <Row align="center" gap="md">
                                        <Column center style={style.avatar}>
                                            <Text bold color={theme.colors.primary}>
                                                {product.name
                                                    .charAt(0)
                                                    .toUpperCase()}
                                            </Text>
                                        </Column>
                                        <Column gap="xs" grow shrink>
                                            <Text medium>{product.name}</Text>
                                            <Text
                                                small
                                                color={theme.colors.darkGrey}>
                                                {convertCentsToFormattedFiat(
                                                    product.priceCents as UsdCents,
                                                )}
                                            </Text>
                                        </Column>
                                    </Row>
                                </Pressable>
                                {selected ? (
                                    <Row align="center" gap="md">
                                        <Pressable
                                            hitSlop={8}
                                            style={style.stepButton}
                                            onPress={() =>
                                                removeItem(product.id)
                                            }>
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
                                            onPress={() => addItem(product.id)}>
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
                                        onPress={() => addItem(product.id)}>
                                        <SvgImage
                                            name="Plus"
                                            size="xs"
                                            color={theme.colors.primary}
                                        />
                                    </Pressable>
                                )}
                            </Row>
                        )
                    })
                )}
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
                    testID="MerchantCheckoutButton"
                    title={
                        itemCount > 0
                            ? `${t('feature.merchant.charge')} ${convertCentsToFormattedFiat(
                                  totalCents,
                              )}`
                            : t('feature.merchant.select-products')
                    }
                    onPress={handleCheckout}
                    disabled={itemCount === 0 || isInvoiceLoading}
                    loading={isInvoiceLoading}
                    containerStyle={style.fullWidth}
                />
                {itemCount > 0 && (
                    <Button
                        type="clear"
                        title={t('feature.merchant.clear')}
                        titleStyle={style.linkLabel}
                        onPress={clearCart}
                    />
                )}
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
        topBar: {
            paddingTop: theme.spacing.sm,
        },
        list: {
            flex: 1,
        },
        listContent: {
            paddingVertical: theme.spacing.sm,
            gap: theme.spacing.sm,
        },
        empty: {
            paddingVertical: theme.spacing.xl,
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
        avatar: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.primaryVeryLight,
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
        linkLabel: {
            fontSize: 14,
            color: theme.colors.darkGrey,
        },
    })

export default MerchantProducts
