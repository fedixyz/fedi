/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { Translate as GoogleTranslate } from '@google-cloud/translate/build/src/v2'
import fs from 'fs'
import { decode, encode } from 'html-entities'
import get from 'lodash/get'
import set from 'lodash/set'
import path from 'path'
import readline from 'readline'

import { formatLanguageJson } from './i18n-utils'

type LanguageJson = { [key: string]: string | LanguageJson }

async function run() {
    // Assemble language files
    const languageCodeRegex = /^[a-z][a-z]$/
    const localizationDir = path.join(__dirname, '..', 'localization')
    const languageCodes = fs
        .readdirSync(localizationDir)
        .filter(name => languageCodeRegex.test(name))
    const languages = languageCodes.map(code => {
        const json = JSON.parse(
            fs.readFileSync(
                path.join(localizationDir, code, 'common.json'),
                'utf8',
            ),
        )
        return {
            code,
            json,
        }
    })

    // Allow them to specify a single language to translate, validate input.
    const targetLanguageCode = process.argv[2]
    if (targetLanguageCode && !languageCodeRegex.test(targetLanguageCode)) {
        console.error(
            `Invalid language code '${targetLanguageCode}', must be 2 lower case characters`,
        )
    }
    if (targetLanguageCode === 'en') {
        console.error(`Cannot autotranslate en, it's the source language`)
        process.exit(1)
    }
    if (targetLanguageCode && !languageCodes.includes(targetLanguageCode)) {
        console.error(
            `Invalid language code '${targetLanguageCode}', must be one of ['${languageCodes.join(
                `', '`,
            )}']. If you would like to add a new language, create a file at ${localizationDir}/${targetLanguageCode}/common.json and run this again.'`,
        )
        process.exit(1)
    } else if (targetLanguageCode) {
        console.info(`Translating only ${targetLanguageCode}`)
    }

    // Queue up keys for translation, and remove keys that don't exist in English
    const englishJson = languages.find(l => l.code === 'en')?.json
    if (!englishJson) {
        throw new Error(`Failed to find English JSON in ${localizationDir}/en`)
    }

    const stats: Record<
        (typeof languageCodes)[number],
        { added: number; removed: number }
    > = {}
    const keysToTranslate: Record<(typeof languageCodes)[number], string[]> = {}

    for (const { code, json: languageJson } of languages) {
        // Skip english or non-target languages
        if (
            code === 'en' ||
            (targetLanguageCode && code !== targetLanguageCode)
        ) {
            continue
        }

        stats[code] = { added: 0, removed: 0 }
        keysToTranslate[code] = []

        const removeLeftoverKeys = (
            langDict: LanguageJson,
            rootPath?: string,
        ) => {
            Object.entries(langDict).forEach(([key, value]) => {
                const keyPath = rootPath ? `${rootPath}.${key}` : key
                if (typeof value !== 'string') {
                    return removeLeftoverKeys(value, keyPath)
                }
                if (!get(englishJson, keyPath)) {
                    delete langDict[key]
                    stats[code].removed++
                }
            })
        }

        const addMissingKeys = (engDict: LanguageJson, rootPath?: string) => {
            Object.entries(engDict).forEach(([key, value]) => {
                const keyPath = rootPath ? `${rootPath}.${key}` : key
                if (typeof value !== 'string') {
                    return addMissingKeys(value, keyPath)
                }
                if (!get(languageJson, keyPath)) {
                    keysToTranslate[code].push(keyPath)
                    stats[code].added++
                }
            })
        }

        removeLeftoverKeys(languageJson)
        addMissingKeys(englishJson)
    }

    // Report our additions and removals
    for (const [code, stat] of Object.entries(stats)) {
        console.info(
            `${code}: ${stat.added} to be added, ${stat.removed} removed`,
        )
    }

    // Ask if they want translations, fire off translation mutations if so
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    const shouldTranslateAdditions = await new Promise(resolve => {
        rl.question('Do you want to translate the additions? (y/n)', answer => {
            resolve(answer.toLowerCase() === 'y')
        })
    })

    if (shouldTranslateAdditions) {
        await Promise.all(
            Object.entries(keysToTranslate).map(async ([code, keys]) => {
                if (!keys.length) return
                const languageJson = languages.find(l => l.code === code)?.json
                if (!languageJson) return
                console.info(`Translating ${keys.length} keys for ${code}...`)
                await translateLanguage(languageJson, code, englishJson, keys)
                console.info(`Finished translating ${code}`)
            }),
        )
    }

    // Write the new files
    for (const { code, json } of languages) {
        // Skip english or non-target languages
        if (targetLanguageCode && code !== targetLanguageCode) {
            continue
        }

        const languagePath = path.join(localizationDir, code, 'common.json')
        fs.writeFileSync(languagePath, formatLanguageJson(json))
        console.info('Wrote updated language file to', languagePath)
    }

    process.exit(0)
}

/**
 * Mutatively translates a language JSON dictionary from english dictionary keys.
 */
async function translateLanguage(
    toLanguageJson: LanguageJson,
    toLanguageCode: string,
    englishLanguageJson: LanguageJson,
    keysToTranslate: string[],
): Promise<void> {
    const values = keysToTranslate.map(
        keyPath => get(englishLanguageJson, keyPath) as string,
    )
    const translatedValues = await getLanguageTranslation(
        'en',
        toLanguageCode,
        values,
    )
    if (values.length !== translatedValues.length) {
        throw new Error(
            `Mismatched translation value lengths, sent ${values.length}, received ${translatedValues.length}`,
        )
    }
    for (let i = 0; i < keysToTranslate.length; i++) {
        set(toLanguageJson, keysToTranslate[i], translatedValues[i])
    }
}

/**
 * Translates a set of strings from one language to another. Requires
 * AZURE_RAPID_API_KEY be set.
 *
 * Uses a bulk translation and encoding / decoding technique taken from
 * https://github.com/while1618/i18n-auto-translation
 */
async function getLanguageTranslation(
    from: string,
    to: string,
    values: string[],
): Promise<string[]> {
    if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
        throw new Error(
            'Missing required environment variable GOOGLE_TRANSLATE_API_KEY',
        )
    }

    // Encode & format values for translation
    const delimiter = '\n{|}\n'
    const skipWordRegex = /({{([^{}]+)}}|<([^<>]+)>|<\/([^<>]+)>|\{([^{}]+)\})/g
    const skippedWords: string[] = []

    const encodedValues = encode(
        values
            .map(v =>
                v.replace(skipWordRegex, (match: string) => {
                    skippedWords.push(match.trim())
                    return `{{${skippedWords.length - 1}}}`
                }),
            )
            .join(delimiter),
    )

    const [translations] = await new GoogleTranslate({
        key: process.env.GOOGLE_TRANSLATE_API_KEY,
    }).translate(encodedValues, { from, to })

    // Decode & unformat values from translation
    const decoded = decode(translations)
        .split(delimiter)
        .map(t => t.replace(skipWordRegex, () => `${skippedWords.shift()}`))

    return decoded
}

run()
