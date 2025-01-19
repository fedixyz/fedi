import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { changeLanguage, selectLanguage } from '@fedi/common/redux'

import CheckBox from '../components/ui/CheckBox'
import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'

const LanguageSettings: React.FC = () => {
    const { theme } = useTheme()
    const { i18n } = useTranslation()
    const dispatch = useAppDispatch()
    const language = useAppSelector(selectLanguage)

    const style = styles(theme)

    const languages = {
        en: 'English',
        es: 'Español',
        fr: 'Français',
        id: 'Bahasa Indonesia',
        tl: 'Tagalog',
        my: 'ဘာသာမန်',
        pt: 'Português',
        ar: 'العربية',
        ara: 'Juba Arabic',
        rn: 'Ikirundi',
        rw: 'Ikinyarwanda',
        so: 'Soomaaliga',
        sw: 'Kiswahili',
        am: 'አማርኛ',
    }

    return (
        <SafeScrollArea style={style.container} edges="notop">
            {Object.entries(languages).map(([lang, display]) => (
                <CheckBox
                    key={lang}
                    checkedIcon={<SvgImage name="RadioSelected" />}
                    uncheckedIcon={<SvgImage name="RadioUnselected" />}
                    title={<Text style={style.radioText}>{display}</Text>}
                    checked={(language || i18n.language) === lang}
                    onPress={() => {
                        dispatch(
                            changeLanguage({
                                i18n,
                                language: lang,
                            }),
                        )
                    }}
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

export default LanguageSettings
