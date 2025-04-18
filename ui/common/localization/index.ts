import commonAM from './am/common.json'
import commonAR from './ar/common.json'
import commonARA from './ara/common.json'
import commonEN from './en/common.json'
import commonES from './es/common.json'
import commonFR from './fr/common.json'
import commonID from './id/common.json'
import commonMY from './my/common.json'
import commonPT from './pt/common.json'
import commonRN from './rn/common.json'
import commonRW from './rw/common.json'
import commonSO from './so/common.json'
import commonSW from './sw/common.json'
import commonTL from './tl/common.json'
import commonUK from './uk/common.json'

export const resources = {
    en: {
        translation: commonEN,
    },
    es: {
        translation: commonES,
    },
    fr: {
        translation: commonFR,
    },
    id: {
        translation: commonID,
    },
    pt: {
        translation: commonPT,
    },
    tl: {
        translation: commonTL,
    },
    ar: {
        translation: commonAR,
    },
    ara: {
        translation: commonARA,
    },
    rn: {
        translation: commonRN,
    },
    rw: {
        translation: commonRW,
    },
    so: {
        translation: commonSO,
    },
    sw: {
        translation: commonSW,
    },
    uk: {
        translation: commonUK,
    },
    am: {
        translation: commonAM,
    },
    my: {
        translation: commonMY,
    },
}

export const i18nLanguages: Record<keyof typeof resources, string> = {
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
    uk: 'Українська',
} as const
