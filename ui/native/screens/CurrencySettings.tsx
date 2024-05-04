import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    changeSelectedFiatCurrency,
    selectCurrency,
    selectCurrencies,
} from '@fedi/common/redux/currency'
import { formatCurrencyText } from '@fedi/common/utils/format'

import CheckBox from '../components/ui/CheckBox'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'

const CurrencySettings: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const reduxDispatch = useAppDispatch()
    const selectedFiatCurrency = useAppSelector(selectCurrency)
    const currencies = useAppSelector(selectCurrencies)

    const style = styles(theme, insets)

    return (
        <ScrollView
            style={style.scrollContainer}
            contentContainerStyle={style.contentContainer}
            overScrollMode="auto">
            <View style={style.container}>
                {Object.values(currencies).map(currency => (
                    <CheckBox
                        key={currency}
                        checkedIcon={<SvgImage name="RadioSelected" />}
                        uncheckedIcon={<SvgImage name="RadioUnselected" />}
                        title={
                            <Text style={style.radioText}>
                                {formatCurrencyText(t, currency)}
                            </Text>
                        }
                        checked={selectedFiatCurrency === currency}
                        onPress={() =>
                            reduxDispatch(changeSelectedFiatCurrency(currency))
                        }
                        containerStyle={style.radioContainer}
                    />
                ))}
            </View>
        </ScrollView>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        contentContainer: {
            flexGrow: 1,
            paddingTop: theme.spacing.lg,
            paddingLeft: insets.left + theme.spacing.lg,
            paddingRight: insets.right + theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
            gap: theme.spacing.md,
        },
        container: {
            flex: 1,
            flexDirection: 'column',
        },
        radioContainer: {
            margin: 0,
            paddingHorizontal: 0,
        },
        radioText: {
            paddingHorizontal: theme.spacing.md,
            textAlign: 'left',
        },
    })

export default CurrencySettings
