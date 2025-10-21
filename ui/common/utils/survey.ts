import { z } from 'zod'

import { I18nLanguage } from '../types/localization'

export const activeSurveySchema = z.object({
    url: z.string().url(),
    title: z.string(),
    description: z.string(),
    buttonText: z.string(),
    id: z.string(),
    enabled: z.boolean(),
})

export type ActiveSurvey = z.infer<typeof activeSurveySchema>

export function getSurveyLanguage(language: I18nLanguage): string {
    switch (language) {
        case 'en':
            return 'en'
        case 'es':
            return 'es'
        case 'fr':
            return 'fr'
        case 'id':
            return 'id'
        case 'pt':
            // Redirects to pt-br because Brazilians are the majority of portugese speakers
            // and also because brazilians are more based
            return 'pt-br'
        case 'tl':
            return 'tl'
        case 'ar':
        case 'ara':
            return 'ar'
        case 'rn':
        case 'rw':
            return 'rw'
        case 'so':
            return 'so'
        case 'am':
            return 'am'
        case 'sw':
            return 'sw'
        case 'uk':
            return 'uk'
        default:
            return 'en'
    }
}
