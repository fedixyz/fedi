/* eslint-disable no-console */
import fs from 'fs'
import set from 'lodash/set'
import Papa from 'papaparse'
import path from 'path'

import { i18nLanguages } from '../localization'
import { formatLanguageJson, getLangJson } from './i18n-utils'

async function run() {
    // Get args
    const lang = process.argv[2]
    const csvPath = path.resolve(__dirname, process.argv[3])
    const mode = process.argv[4] ?? 'additive'
    const targetIndex = process.argv[5] ?? '-1'

    if (!Object.keys(i18nLanguages).includes(lang)) {
        console.error(
            `Error: Language must be one of (${Object.keys(i18nLanguages).join(
                '/',
            )})`,
        )
        return
    }

    if (mode !== 'additive' && mode !== 'overwrite') {
        console.error(
            `Error: Mode must be one of (additive/overwrite), got ${mode}`,
        )
        return
    }

    if (isNaN(Number(targetIndex))) {
        console.error(
            `Error: When provided, targetIndex must be a number, got ${targetIndex}`,
        )
        return
    }

    // Read in language JSON and CSV
    const csvText = fs.readFileSync(csvPath, 'utf8')
    const langJsonPath = path.join(
        __dirname,
        '..',
        'localization',
        lang,
        'common.json',
    )
    const langJson =
        // If mode is overwrite, start from the ground
        // Otherwise, modify the existing language JSON
        mode === 'overwrite' ? {} : getLangJson(lang)

    // Apply CSV to JSON
    const parsedCsv = Papa.parse<Array<string>>(csvText).data

    console.info(`Reading in ${parsedCsv.length} rows from CSV`)

    for (const row of parsedCsv) {
        const key = row[0]
        const translatedText = row.at(Number(targetIndex))?.replace(/""/g, '"')

        if (!key.includes('.')) {
            console.debug(`Skipping "${row}", looks like the header of the CSV`)
            continue
        }
        if (!translatedText) {
            console.debug(`Skipping "${key}", translated text column is empty`)
            continue
        }
        set(langJson, key, translatedText)
    }

    // Write the new JSON to the language JSON file
    fs.writeFileSync(langJsonPath, formatLanguageJson(langJson), 'utf8')
}

run()
