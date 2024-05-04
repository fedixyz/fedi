import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { resources } from '@fedi/common/localization'

i18n.use(initReactI18next).init({
    fallbackLng: 'en',
    resources,
    returnNull: false,

    interpolation: {
        escapeValue: false, // not needed for react as it escapes by default
    },
    react: {
        transSupportBasicHtmlNodes: false,
    },
})

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

            let desiredLanguage = 'en'
            if (detected) {
                const lngs = Array.isArray(detected) ? detected : [detected]
                for (const lng of lngs) {
                    if (lng in resources) {
                        desiredLanguage = lng
                        break
                    }
                }
            }
            return desiredLanguage
        },
    )
}

export default i18n
