import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import {
    changeSelectedFiatCurrency,
    selectCurrencies,
    selectCurrency,
} from '@fedi/common/redux/currency'
import { formatCurrencyText } from '@fedi/common/utils/format'

import CheckBox from '../components/ui/CheckBox'
import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'

const CurrencySettings: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const reduxDispatch = useAppDispatch()
    const selectedFiatCurrency = useAppSelector(selectCurrency)
    const currencies = useAppSelector(selectCurrencies)

    const style = styles(theme)

    return (
        <SafeScrollArea style={style.container} edges="notop">
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
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.lg,
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
