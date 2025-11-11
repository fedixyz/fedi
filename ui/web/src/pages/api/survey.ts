import type { NextApiRequest, NextApiResponse } from 'next'

import { ActiveSurvey } from '@fedi/common/utils/survey'

// A unique identifier for the active survey form
const SURVEY_IDENTIFIER = 'would-you-invite-someone-to-use-fedi_oct-2026'

// Whether the active survey form is enabled or not
const IS_SURVEY_ENABLED = process.env.SURVEY_ENABLED === 'true'

// The URL of the active survey form
const SURVEY_URL =
    process.env.FEDI_ENV === 'nightly'
        ? 'https://survey.fedi.xyz/would-you-invite-someone-to-use-fedi-nightly'
        : 'https://survey.fedi.xyz/would-you-invite-someone-to-use-fedi'

// A key-value map of language codes to translated strings for the customizable title in the survey modal
const SURVEY_TITLE_MAP: LangMapWithEnglish = {
    en: 'Help us help you',
    es: 'Ayúdanos a ayudarte',
    id: 'Bantu kami membantu Anda',
    fr: 'Aidez-nous à vous aider',
    pt: 'Nos ajudar também ajuda você',
    so: 'Nagu caawi inaan ku caawinno',
    sw: 'Tusaidie kukusaidia',
    tl: 'Tulungan mo kaming tulugan ka',
    uk: 'Допоможіть нам допомогти вам',
    // TODO: add more translations
}

// A key-value map of language codes to translated strings for the customizable description in the survey modal
const SURVEY_DESCRIPTION_MAP: LangMapWithEnglish = {
    en: 'Just one click to help us improve. We appreciate it.',
    es: 'Solo un clic para ayudarnos a mejorar. Lo agradecemos.',
    id: 'Cukup satu klik untuk membantu kami berkembang. Kami sangat menghargainya.',
    fr: 'Un seul clic pour nous aider à nous améliorer. Merci.',
    pt: 'Apenas um clique para nos ajudar a melhorar. Nós agradecemos.',
    so: 'Kaliya hal guji si aad nooga caawiso horumarinta. Waanu u mahadcelinaynaa.',
    sw: 'Bonyeza mara mmoja tu ili kutusaidia kuboresha. Tunashukuru.',
    tl: 'Isang click lang para matulungan kaming umunlad. Pinahahalagahan namin ito.',
    uk: 'Лише один клік, щоб допомогти нам покращитися. Ми це цінуємо.',
    // TODO: add more translations
}

// A key-value map of language codes to translated strings for the customizable button in the survey modal
const SURVEY_BUTTON_MAP: LangMapWithEnglish = {
    en: 'Give feedback',
    es: 'Deja tus comentarios',
    id: 'Berikan umpan balik',
    fr: "Donner un retour d'information",
    pt: 'Enviar feedback',
    so: 'Warcelin ka bixi',
    sw: 'Toa maoni',
    tl: 'Magbigay ng feedback',
    uk: 'Дати відгук',
    // TODO: add more translations
}

type LangMapWithEnglish = { en: string } & Record<string, string | undefined>

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    const langQuery = req.query['lang']
    const lang = typeof langQuery === 'string' ? langQuery : 'en'

    const response: ActiveSurvey = {
        url: SURVEY_URL,
        id: SURVEY_IDENTIFIER,
        enabled: IS_SURVEY_ENABLED,
        // Fall back to English if no translation for the `lang` query param is found
        title: SURVEY_TITLE_MAP[lang] ?? SURVEY_TITLE_MAP['en'],
        description:
            SURVEY_DESCRIPTION_MAP[lang] ?? SURVEY_DESCRIPTION_MAP['en'],
        buttonText: SURVEY_BUTTON_MAP[lang] ?? SURVEY_BUTTON_MAP['en'],
    }

    res.status(200).json(response)
}
