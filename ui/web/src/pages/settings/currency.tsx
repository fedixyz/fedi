import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { changeOverrideCurrency, selectCurrency } from '@fedi/common/redux'
import { getSelectableCurrencies } from '@fedi/common/utils/currency'
import { formatCurrencyText } from '@fedi/common/utils/format'

import { ContentBlock } from '../../components/ContentBlock'
import * as Layout from '../../components/Layout'
import { RadioGroup } from '../../components/RadioGroup'
import { useAppDispatch, useAppSelector } from '../../hooks'

function SettingsCurrencyPage() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const currency = useAppSelector(selectCurrency)
    const selectableCurrencies = getSelectableCurrencies()

    const currencyOptions = useMemo(
        () =>
            Object.entries(selectableCurrencies).map(([_, value]) => ({
                label: formatCurrencyText(t, value),
                value,
            })),
        [t, selectableCurrencies],
    )

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back>
                    <Layout.Title subheader>{t('words.currency')}</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <RadioGroup
                        options={currencyOptions}
                        value={currency}
                        onChange={value =>
                            dispatch(changeOverrideCurrency(value))
                        }
                    />
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

export default SettingsCurrencyPage
