/* eslint-disable no-console */
import fs from 'fs'
import set from 'lodash/set'
import path from 'path'

import { formatLanguageJson } from './i18n-utils'

async function run() {
    // Get args
    const languageCode = process.argv[2]
    const csvPath = path.resolve(__dirname, process.argv[3])

    if (!languageCode || !csvPath) {
        console.error('Usage: i18n:import-csv <languageCode> <csvPath>')
        process.exit(1)
    }

    const languageCodeRegex = /^[a-z][a-z]$/
    if (!languageCodeRegex.test(languageCode)) {
        console.error(
            `Invalid language code: must be 2 lower case characters (e.g. 'en', 'fr')`,
        )
        process.exit(1)
    }

    // Read in language JSON and CSV
    const csvText = fs.readFileSync(csvPath, 'utf8')
    const langJsonPath = path.join(
        __dirname,
        '..',
        'localization',
        languageCode,
        'common.json',
    )
    const langJson = JSON.parse(
        fs.readFileSync(path.join(langJsonPath), 'utf8'),
    )

    // Apply CSV to JSON
    const parsedCsv = parseCsv(csvText)
    console.info(`Reading in ${parsedCsv.length} rows from CSV`)
    for (const row of parsedCsv) {
        const key = row[0].trim()
        const translatedText = row.at(-1)?.trim().replace(/""/g, '"')
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

/**
 * Given some CSV text, parse into an array of rows, each of which is an array
 * of columns. Handles escape characters with commas.
 */
function parseCsv(csvText: string): string[][] {
    const rows = csvText.split('\n')
    const result: string[][] = []

    for (const row of rows) {
        const columns: string[] = []
        let currentColumn = ''
        let insideQuotes = false

        for (let i = 0; i < row.length; i++) {
            const char = row[i]

            if (char === ',' && !insideQuotes) {
                columns.push(currentColumn)
                currentColumn = ''
            } else if (char === '"' && !insideQuotes) {
                insideQuotes = true
            } else if (char === '"' && insideQuotes) {
                if (i === row.length - 2 || row[i + 1] === ',') {
                    columns.push(currentColumn)
                    currentColumn = ''
                    insideQuotes = false
                    i++ // Skip the comma
                } else {
                    currentColumn += '"'
                }
            } else {
                currentColumn += char
            }
        }

        columns.push(currentColumn)
        result.push(columns)
    }

    return result
}

run()
