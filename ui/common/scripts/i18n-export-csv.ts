/* eslint-disable no-console */
import fs from 'fs'
import get from 'lodash/get'
import path from 'path'

type LanguageJson = { [key: string]: string | LanguageJson }

async function run() {
    // Read in english JSON
    const localizationPath = path.join(__dirname, '..', 'localization')
    const enJson = JSON.parse(
        fs.readFileSync(path.join(localizationPath, 'en/common.json'), 'utf8'),
    )

    // Convert JSON to CSV
    let csv = `Key,Text (English),Text (Translated)`
    function appendKeysToCsv(json: LanguageJson, root?: string) {
        Object.entries(json).forEach(([key, value]) => {
            const keyPath = root ? `${root}.${key}` : key
            if (typeof value !== 'string') {
                return appendKeysToCsv(value, keyPath)
            }
            if (!get(json, keyPath)) {
                const escaped = `"${value.replace(/"/g, '""')}"`
                csv += `\r\n${keyPath},${escaped},`
            }
        })
    }
    appendKeysToCsv(enJson)

    // Write the CSV to the en folder
    const csvPath = path.join(localizationPath, 'export.csv')
    fs.writeFileSync(csvPath, csv, 'utf8')
    console.info('Success! Wrote CSV to', csvPath)
}

run()
