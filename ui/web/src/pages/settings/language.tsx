import { useTranslation } from 'react-i18next'

import { i18nLanguages } from '@fedi/common/localization'
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

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/settings">
                    <Layout.Title subheader>{t('words.language')}</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <RadioGroup
                        options={Object.entries(i18nLanguages).map(
                            ([key, value]) => ({
                                label: value,
                                value: key,
                            }),
                        )}
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
