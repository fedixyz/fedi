import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { currencyFlags } from '@fedi/common/constants/currency'
import {
    selectFederationCurrencies,
    selectFederationCurrency,
    selectFederationDefaultCurrency,
    setFederationCurrency,
} from '@fedi/common/redux/currency'
import { formatCurrencyText } from '@fedi/common/utils/format'

import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { SelectableCurrency } from '../types'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'FederationCurrency'
>

const FederationCurrency: React.FC<Props> = props => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { federationId } = props.route.params
    const currencies = useAppSelector(s =>
        selectFederationCurrencies(s, federationId),
    )
    const defaultCurrency = useAppSelector(s =>
        selectFederationDefaultCurrency(s, federationId),
    )

    const style = styles(theme)

    return (
        <SafeScrollArea style={style.container} edges="notop">
            <View style={style.content}>
                <View style={style.currencyContainer}>
                    <Text caption style={style.label}>
                        {t('phrases.community-default')}
                    </Text>
                    <CurrencyItem
                        currency={defaultCurrency}
                        federationId={federationId}
                    />
                </View>
                <View style={style.currencyContainer}>
                    <Text caption style={style.label}>
                        {t('words.others')}
                    </Text>
                    {Object.values(currencies).map(currency => (
                        <CurrencyItem
                            currency={currency}
                            federationId={federationId}
                            key={currency}
                        />
                    ))}
                </View>
            </View>
        </SafeScrollArea>
    )
}

function CurrencyItem({
    currency,
    federationId,
}: {
    currency: SelectableCurrency
    federationId: string
}) {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const selectedFiatCurrency = useAppSelector(s =>
        selectFederationCurrency(s, federationId),
    )

    const style = styles(theme)

    const isSelected = selectedFiatCurrency === currency

    return (
        <Pressable
            key={currency}
            onPress={() =>
                dispatch(setFederationCurrency({ federationId, currency }))
            }
            style={style.currencyItem}>
            <Text style={style.currencyFlag} h2>
                {currencyFlags[currency]}
            </Text>
            <Text
                style={[
                    style.currencyText,
                    { fontWeight: isSelected ? 'bold' : 'normal' },
                ]}>
                {formatCurrencyText(t, currency)}
            </Text>
            {isSelected && <SvgImage name="Check" />}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.lg,
        },
        content: {
            gap: theme.spacing.lg,
        },
        currencyItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        currencyFlag: {
            color: theme.colors.primary,
        },
        currencyText: {
            flex: 1,
        },
        label: {
            color: theme.colors.darkGrey,
        },
        currencyContainer: {
            gap: theme.spacing.md,
        },
    })

export default FederationCurrency
