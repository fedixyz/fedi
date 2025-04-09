import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { changeOverrideCurrency, selectCurrency } from '@fedi/common/redux'
import { SupportedCurrency } from '@fedi/common/types'
import { formatCurrencyText } from '@fedi/common/utils/format'

import { ContentBlock } from '../../components/ContentBlock'
import * as Layout from '../../components/Layout'
import { RadioGroup } from '../../components/RadioGroup'
import { useAppDispatch, useAppSelector } from '../../hooks'

function SettingsCurrencyPage() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const currency = useAppSelector(selectCurrency)

    const currencyOptions = useMemo(
        () =>
            Object.entries(SupportedCurrency).map(
                ([_, value]: [string, SupportedCurrency]) => ({
                    label: formatCurrencyText(t, value),
                    value,
                }),
            ),
        [t],
    )

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/settings">
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
