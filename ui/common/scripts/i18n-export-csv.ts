/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

import { i18nLanguages } from '../localization'
import {
    flattenObject,
    getLangJson,
    LanguageJson,
    localizationPath,
} from './i18n-utils'

const modes = ['default', 'missing']

function escapeValue(value: string) {
    return `"${value.replace(/"/g, '""').replace(/\n/g, '\\n')}"`
}

async function run() {
    const targetLang = process.argv[2]
    const mode = process.argv[3] ?? 'default'
    const excludeEnglish = process.argv[4] ?? 'false'

    // If a target language is provided, it must be one of the supported languages
    if (targetLang && !Object.keys(i18nLanguages).includes(targetLang)) {
        console.error(
            `Error: Target language must be one of (${Object.keys(
                i18nLanguages,
            ).join('/')}), got ${targetLang}`,
        )
        return
    }

    // If a mode is provided, it must be one of the supported modes
    if (!modes.includes(mode)) {
        console.error(
            `Error: Mode must be one of (${modes.join('/')}), got ${mode}`,
        )
        return
    }

    if (!targetLang) {
        // Multi-language CSV: export all supported language translations in one CSV
        buildMultiLanguageCSV()
    } else {
        // Single-language CSV: export with optional "missing" or "default" mode
        buildSingleLanguageCSV(targetLang, mode, excludeEnglish)
    }
}

/**
 * Builds a single-language CSV file with optional mode:
 *  - "default": all keys (including blanks where translation is not present)
 *  - "missing": only keys missing from the specified target language
 */
function buildSingleLanguageCSV(
    targetLang: string,
    mode: string,
    excludeEnglish: string,
) {
    const enJson = getLangJson('en')
    const flattenedEn = flattenObject(enJson)
    const targetJson = getLangJson(targetLang)
    const flattenedTarget = flattenObject(targetJson)

    const keys = ['Key']

    const shouldIncludeEnglish = !(
        excludeEnglish === 'true' || excludeEnglish === 'yes'
    )
    if (shouldIncludeEnglish) keys.push('Original (en)')

    keys.push(`Translation (${targetLang})`)

    // Convert JSON to CSV
    let csv = keys.join(',')

    let languageJson: LanguageJson = {}

    // include ALL keys for the target translation
    if (mode === 'default') {
        for (const [key] of Object.entries(flattenedEn)) {
            languageJson[key] = flattenedTarget[key] ?? ''
        }
    }
    // only include keys that are missing from the target translation
    else if (mode === 'missing') {
        for (const [key] of Object.entries(flattenedEn)) {
            if (!flattenedTarget[key]) {
                languageJson[key] = ''
            }
        }
    } else {
        // no-op
        languageJson = flattenedTarget
    }

    // Iterates over the KV pairs for the target translation and adds them as rows to the CSV
    // including the English value as an additional column if requested
    Object.entries(languageJson).forEach(([key, value]) => {
        if (typeof value !== 'string') return

        const row = [key]

        if (shouldIncludeEnglish)
            row.push(
                escapeValue(
                    flattenedEn[key as keyof typeof flattenedEn] as string,
                ),
            )

        row.push(value ? escapeValue(value) : '')

        csv += `\r\n${row.join(',')}`
    })
    // Write the CSV
    const csvPath = path.join(localizationPath, 'export.csv')
    fs.writeFileSync(csvPath, csv, 'utf8')
    console.info('Success! Wrote multi-language CSV to', csvPath)
}

/**
 * Builds a CSV file exporting all supported languages at once.
 * - One row for each key found across *all* languages.
 * - Columns: Key, "Original (en)", plus "Translation (xx)" for each language.
 */
function buildMultiLanguageCSV() {
    const englishTranslations = flattenObject(getLangJson('en'))
    const allLangs = Object.keys(i18nLanguages).filter(
        // skip english since it is always included
        lang => lang !== 'en',
    )
    // Collect all keys from english translation file
    const allKeys: string[] = Object.entries(englishTranslations).map(
        ([key]) => key,
    )

    // Headers: Key, "Original (en)", plus columns for all languages
    const headers = ['Key', 'Original (en)']
    for (const lang of allLangs) {
        headers.push(`Translation (${lang})`)
    }

    let csv = headers.join(',')

    // Build each row for the CSV
    for (const key of allKeys) {
        if (typeof englishTranslations[key] !== 'string') return
        const row = [key]
        // always include the english translation as Original (en)
        row.push(escapeValue(englishTranslations[key]))

        for (const lang of allLangs) {
            const targetTranslations = flattenObject(getLangJson(lang))
            const targetLangTranslatedValue = targetTranslations[key] ?? ''
            row.push(escapeValue(targetLangTranslatedValue))
        }

        csv += '\r\n' + row.join(',')
    }

    // Write the CSV
    const csvPath = path.join(localizationPath, 'export.csv')
    fs.writeFileSync(csvPath, csv, 'utf8')
    console.info('Success! Wrote multi-language CSV to', csvPath)
}

run()
