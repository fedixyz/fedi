import { I18nLanguage } from '../types/localization'

export function getSurveyLanguage(language: I18nLanguage): string {
    switch (language) {
        case 'en':
            return 'en'
        case 'es':
            return 'es'
        case 'fr':
            return 'fr'
        case 'pt':
            return 'pt'
        default:
            return 'en'
    }
}
