/* eslint-disable no-console */
import spawn from 'cross-spawn'
import { lstatSync, readdirSync, writeFileSync } from 'fs'
import unset from 'lodash/unset'
import path from 'path'
import process from 'process'

import {
    LanguageJson,
    flattenObject,
    formatLanguageJson,
    getLangJson,
} from './i18n-utils'

const protectedPrefixes = [
    // These are dynamic keys that are accessed via template strings in the UI
    // There is no way for even typescript to know if these are missing or not
    'feature.settings.currency-names',
]

const uiPath = path.dirname(process.cwd())
const localizationPath = path.join(uiPath, 'common', 'localization')

const unusedKeys = []

const grepKeyExists = async (key: string) => {
    // Grep for a key followed by ' or " in all ts/tsx files that are not in `node_modules` or `dist`
    const regex = `${key}['"\`]`

    const rg = spawn('rg', [regex, '--vimgrep', '--type=ts'], {
        stdio: 'inherit',
        cwd: uiPath,
    })

    return await new Promise<boolean>(resolve => {
        rg.stdout?.on('data', () => {
            resolve(true)
        })

        rg.on('exit', code => {
            resolve(code === 0)
        })

        rg.on('error', () => {
            resolve(false)
        })
    })
}

;(async () => {
    const dryRun = process.argv[2] === '-n'
    const localizationChildren = readdirSync(localizationPath)
    const languages = localizationChildren.filter(child =>
        lstatSync(path.join(localizationPath, child)).isDirectory(),
    )

    const languageJsons = languages.reduce(
        (acc, language) => {
            const languageJson = getLangJson(language)
            acc[language] = languageJson
            return acc
        },
        {} as Record<string, LanguageJson>,
    )

    const allKeys = []

    for (const language of languages) {
        const languageJson = flattenObject(languageJsons[language])

        for (const key of Object.keys(languageJson)) {
            allKeys.push(key)
        }
    }

    const uniqueKeys = Array.from(new Set(allKeys))
    const filteredKeys = uniqueKeys.filter(
        key => !protectedPrefixes.some(prefix => key.startsWith(prefix)),
    )

    for (const key of filteredKeys) {
        const keyExists = await grepKeyExists(key)

        if (!keyExists) {
            unusedKeys.push(key)
        }
    }

    if (dryRun) {
        console.log('Found', unusedKeys.length, 'unused i18n keys')
        return
    }

    for (const language of languages) {
        const languageJson = languageJsons[language]

        for (const key of unusedKeys) {
            unset(languageJson, key)
        }

        const langJsonPath = path.join(
            localizationPath,
            language,
            'common.json',
        )

        writeFileSync(langJsonPath, formatLanguageJson(languageJson), 'utf8')
    }

    console.log(
        'Removed',
        unusedKeys.length,
        'unused i18n keys from',
        languages.length,
        'languages',
    )
})()
