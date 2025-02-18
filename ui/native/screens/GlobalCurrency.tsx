import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { currencyFlags } from '@fedi/common/constants/currency'
import {
    changeOverrideCurrency,
    selectOverrideCurrency,
} from '@fedi/common/redux/currency'
import { formatCurrencyText } from '@fedi/common/utils/format'

import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { SupportedCurrency } from '../types'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'GlobalCurrency'>

const GlobalCurrency: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const overrideCurrency = useAppSelector(s => selectOverrideCurrency(s))
    const dispatch = useAppDispatch()

    const style = styles(theme)

    const currencies = Object.values(SupportedCurrency).filter(
        c => c !== SupportedCurrency.USD,
    )

    const isSelected = overrideCurrency === null

    return (
        <SafeScrollArea style={style.container} edges="notop">
            <View style={style.content}>
                <View style={style.currencyContainer}>
                    <Pressable
                        onPress={() => dispatch(changeOverrideCurrency(null))}
                        style={style.currencyItem}>
                        <Text style={style.currencyFlag} h2>
                            {'🌐'}
                        </Text>
                        <Text
                            style={[
                                style.currencyText,
                                {
                                    fontWeight: isSelected ? 'bold' : 'normal',
                                },
                            ]}>
                            {t('phrases.community-default')}
                        </Text>
                        {isSelected && <SvgImage name="Check" />}
                    </Pressable>
                    {
                        // Put USD first
                        [SupportedCurrency.USD, ...currencies].map(currency => (
                            <CurrencyItem currency={currency} key={currency} />
                        ))
                    }
                </View>
            </View>
        </SafeScrollArea>
    )
}

function CurrencyItem({ currency }: { currency: SupportedCurrency }) {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const overrideCurrency = useAppSelector(s => selectOverrideCurrency(s))

    const style = styles(theme)

    const isSelected = overrideCurrency === currency

    return (
        <Pressable
            key={currency}
            onPress={() => dispatch(changeOverrideCurrency(currency))}
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

export default GlobalCurrency
