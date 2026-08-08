import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native'

import { useBtcFiatPrice } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { selectSelectedFederation } from '@fedi/common/redux'
import { UsdCents } from '@fedi/common/types'

import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import {
    loadMerchantCatalog,
    makeProductId,
    MerchantProduct,
    saveMerchantCatalog,
} from '../utils/merchantCatalog'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MerchantCatalogEdit'
>

const MerchantCatalogEdit: React.FC<Props> = ({ route }) => {
    const selectedFederation = useAppSelector(selectSelectedFederation)
    const federationId = route.params?.federationId || selectedFederation?.id

    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const { convertCentsToFormattedFiat } = useBtcFiatPrice(
        undefined,
        federationId,
    )

    const [items, setItems] = useState<MerchantProduct[]>([])
    const [name, setName] = useState('')
    const [price, setPrice] = useState('')

    useEffect(() => {
        let active = true
        loadMerchantCatalog(federationId).then(loaded => {
            if (active) setItems(loaded)
        })
        return () => {
            active = false
        }
    }, [federationId])

    const persist = (next: MerchantProduct[]) => {
        setItems(next)
        saveMerchantCatalog(federationId, next).catch(e => toast.error(t, e))
    }

    const priceCents = Math.round(parseFloat(price) * 100)
    const canAdd = name.trim().length > 0 && Number.isFinite(priceCents) && priceCents > 0

    const handleAdd = () => {
        if (!canAdd) return
        persist([
            ...items,
            {
                id: makeProductId(),
                name: name.trim(),
                priceCents: priceCents as UsdCents,
            },
        ])
        setName('')
        setPrice('')
    }

    const handleRemove = (id: string) =>
        persist(items.filter(item => item.id !== id))

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <ScrollView
                style={style.list}
                contentContainerStyle={style.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled">
                {items.length === 0 ? (
                    <Text caption color={theme.colors.grey} style={style.empty}>
                        {t('feature.merchant.no-products')}
                    </Text>
                ) : (
                    items.map(item => (
                        <Row
                            key={item.id}
                            align="center"
                            gap="md"
                            style={style.row}>
                            <Column gap="xs" grow>
                                <Text medium>{item.name}</Text>
                                <Text small color={theme.colors.darkGrey}>
                                    {convertCentsToFormattedFiat(
                                        item.priceCents as UsdCents,
                                    )}
                                </Text>
                            </Column>
                            <Pressable
                                hitSlop={8}
                                style={style.deleteButton}
                                onPress={() => handleRemove(item.id)}>
                                <SvgImage
                                    name="Trash"
                                    size="sm"
                                    color={theme.colors.red}
                                />
                            </Pressable>
                        </Row>
                    ))
                )}
            </ScrollView>

            <Column gap="md" fullWidth style={style.addSection}>
                <Text medium>{t('feature.merchant.add-product')}</Text>
                <TextInput
                    style={style.input}
                    value={name}
                    onChangeText={setName}
                    placeholder={t('feature.merchant.item-name')}
                    placeholderTextColor={theme.colors.grey}
                    maxLength={40}
                    returnKeyType="next"
                />
                <Row align="center" gap="sm" fullWidth style={style.priceWrap}>
                    <Text medium color={theme.colors.darkGrey}>
                        $
                    </Text>
                    <TextInput
                        style={style.priceInput}
                        value={price}
                        onChangeText={setPrice}
                        placeholder="0.00"
                        placeholderTextColor={theme.colors.grey}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        onSubmitEditing={handleAdd}
                    />
                </Row>
                <Button
                    testID="AddProductButton"
                    title={t('words.add')}
                    icon={
                        <SvgImage
                            name="Plus"
                            size="xs"
                            color={theme.colors.secondary}
                        />
                    }
                    onPress={handleAdd}
                    disabled={!canAdd}
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
        list: {
            flex: 1,
        },
        listContent: {
            paddingVertical: theme.spacing.md,
            gap: theme.spacing.sm,
        },
        empty: {
            textAlign: 'center',
            paddingVertical: theme.spacing.xl,
        },
        row: {
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
            borderRadius: theme.borders.defaultRadius,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
        },
        deleteButton: {
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
        },
        addSection: {
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: theme.colors.lightGrey,
        },
        input: {
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
            borderRadius: theme.borders.defaultRadius,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            color: theme.colors.primary,
            fontSize: 16,
        },
        priceWrap: {
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
            borderRadius: theme.borders.defaultRadius,
            paddingHorizontal: theme.spacing.lg,
        },
        priceInput: {
            flex: 1,
            paddingVertical: theme.spacing.md,
            color: theme.colors.primary,
            fontSize: 16,
        },
        fullWidth: {
            width: '100%',
        },
    })

export default MerchantCatalogEdit
