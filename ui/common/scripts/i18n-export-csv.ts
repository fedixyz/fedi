/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

type LanguageJson = { [key: string]: string | LanguageJson }

const languages = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    id: 'Indonesian',
    pt: 'Portugese',
}

const modes = ['default', 'translate', 'correct']

function flattenObject(obj: LanguageJson, prefix = ''): LanguageJson {
    return Object.entries(obj).reduce((acc, [key, value]) => {
        const newKey = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'object' && value !== null) {
            Object.assign(acc, flattenObject(value, newKey))
        } else {
            acc[newKey] = value
        }
        return acc
    }, {} as LanguageJson)
}

async function run() {
    const lang = process.argv[2] ?? 'en'
    const mode = process.argv[3] ?? 'default'

    if (!Object.keys(languages).includes(lang)) {
        console.error(
            `Error: Language must be one of (${Object.keys(languages).join(
                '/',
            )})`,
        )
        return
    }

    if (!modes.includes(mode)) {
        console.error(`Error: Mode must be one of (${modes.join('/')})`)
        return
    }

    // Read in english JSON
    const localizationPath = path.join(__dirname, '..', 'localization')
    const getLangJson = (l: keyof typeof languages) =>
        JSON.parse(
            fs.readFileSync(
                path.join(localizationPath, l + '/common.json'),
                'utf8',
            ),
        )
    const langJson = getLangJson(lang as keyof typeof languages)
    const enJson = getLangJson('en')

    const originalLang = `Translation (${
        languages[lang as keyof typeof languages]
    })`

    const keys = ['Key']

    if (mode !== 'default') keys.push('Original (English)')

    keys.push(originalLang)

    // Convert JSON to CSV
    let csv = keys.join(',')
    const translation = flattenObject(langJson)
    const englishTranslation = flattenObject(enJson)

    Object.entries(translation).forEach(([key, value]) => {
        if (typeof value !== 'string') return

        const row = [key]
        const escapeValue = (v: string) => `"${v.replace(/"/g, '""')}"`

        if (mode !== 'default')
            row.push(
                escapeValue(
                    englishTranslation[
                        key as keyof typeof englishTranslation
                    ] as string,
                ),
            )

        if (mode === 'translate') row.push('')
        else row.push(escapeValue(value))

        csv += `\r\n${row.join(',')}`
    })

    // Write the CSV to the en folder
    const csvPath = path.join(localizationPath, 'export.csv')
    fs.writeFileSync(csvPath, csv, 'utf8')
    console.info('Success! Wrote CSV to', csvPath)
}

run()
