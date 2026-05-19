import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { resources } from '@fedi/common/localization'

const DEFAULT_LANGUAGE = 'en'

i18n.use(initReactI18next).init({
    fallbackLng: DEFAULT_LANGUAGE,
    resources,
    returnNull: false,

    interpolation: {
        escapeValue: false, // not needed for react as it escapes by default
    },
    react: {
        transSupportBasicHtmlNodes: false,
    },
})

export function getSupportedBrowserLanguage(languages: readonly string[]) {
    const resourceKeys = Object.keys(resources)

    for (const language of languages) {
        if (language in resources) return language

        const baseLanguage = language.split(/[-_]/)[0]
        if (baseLanguage && resourceKeys.includes(baseLanguage)) {
            return baseLanguage
        }
    }

    return DEFAULT_LANGUAGE
}

export function detectBrowserLanguage() {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE

    return getSupportedBrowserLanguage([
        ...(window.navigator.languages ?? []),
        window.navigator.language,
    ])
}

/**
 * Attempt to detect the user's language, and then configure i18n to use that.
 * Should be called after initial render to avoid SSR rehydrate mismatch.
 */
export function detectLanguage() {
    // If they didn't have something in LS, detect & set.
    return import('i18next-browser-languagedetector').then(
        ({ default: LanguageDetector }) => {
            const detector = new LanguageDetector(i18n.services)
            const detected = detector.detect()

            if (detected) {
                const lngs = Array.isArray(detected) ? detected : [detected]
                return getSupportedBrowserLanguage(lngs)
            }
            return DEFAULT_LANGUAGE
        },
    )
}

export default i18n
