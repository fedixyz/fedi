import React from 'react'
import { useTranslation } from 'react-i18next'

import { changeLanguage, selectLanguage } from '@fedi/common/redux'

import { ContentBlock } from '../../components/ContentBlock'
import * as Layout from '../../components/Layout'
import { RadioGroup } from '../../components/RadioGroup'
import { useAppDispatch, useAppSelector } from '../../hooks'
import i18n from '../../localization/i18n'

function LanguageSettings() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const language = useAppSelector(selectLanguage)

    const languageOptions = [
        {
            label: 'English',
            value: 'en',
        },
        {
            label: 'Español',
            value: 'es',
        },
        {
            label: 'Français',
            value: 'fr',
        },
        {
            label: 'Português',
            value: 'pt',
        },
        {
            label: 'Bahasa Indonesia',
            value: 'id',
        },
        {
            label: 'العربية',
            value: 'ar',
        },
        {
            label: 'Juba Arabic',
            value: 'ara',
        },
        {
            label: 'Ikirundi',
            value: 'rn',
        },
        {
            label: 'Ikinyarwanda',
            value: 'rw',
        },
        {
            label: 'Soomaaliga',
            value: 'so',
        },
        {
            label: 'Kiswahili',
            value: 'sw',
        },
        {
            label: 'አማርኛ',
            value: 'am',
        },
    ]

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/settings">
                    <Layout.Title subheader>{t('words.language')}</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <RadioGroup
                        options={languageOptions}
                        value={language || i18n.language}
                        onChange={value => {
                            dispatch(
                                changeLanguage({
                                    language: value,
                                    i18n,
                                }),
                            )
                        }}
                    />
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

export default LanguageSettings
