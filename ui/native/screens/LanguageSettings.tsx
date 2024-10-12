import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { changeLanguage, selectLanguage } from '@fedi/common/redux'

import CheckBox from '../components/ui/CheckBox'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'

const LanguageSettings: React.FC = () => {
    const { theme } = useTheme()
    const { i18n } = useTranslation()
    const dispatch = useAppDispatch()
    const insets = useSafeAreaInsets()
    const language = useAppSelector(selectLanguage)

    const style = styles(theme, insets)

    const languages = {
        en: 'English',
        es: 'Español',
        fr: 'Français',
        id: 'Bahasa Indonesia',
        tl: 'Tagalog',
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
        <ScrollView
            style={style.scrollContainer}
            contentContainerStyle={style.contentContainer}
            overScrollMode="auto">
            <View style={style.container}>
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

export default LanguageSettings
