import fs from 'fs'
import jsonStringify from 'json-stable-stringify'
import path from 'path'

/**
 * Given a language dictionary JSON, format it for writing to disk.
 */
export function formatLanguageJson(json: object) {
    const topKeyOrder = ['words', 'phrases', 'errors', 'feature']
    return (
        jsonStringify(json, {
            space: 4,
            cmp: (a, b) => {
                // Keep top level keys in order
                if (
                    topKeyOrder.includes(a.key) ||
                    topKeyOrder.includes(b.key)
                ) {
                    return (
                        topKeyOrder.indexOf(a.key) - topKeyOrder.indexOf(b.key)
                    )
                }
                // Otherwise sort alphabetically
                return a.key.localeCompare(b.key)
            },
        }) + '\n'
    )
}

export type LanguageJson = { [key: string]: string | LanguageJson }

export const localizationPath = path.join(__dirname, '..', 'localization')
export const getLangJson = (l: string) =>
    JSON.parse(
        fs.readFileSync(
            path.join(localizationPath, l + '/common.json'),
            'utf8',
        ),
    )

export function flattenObject(obj: LanguageJson, prefix = ''): LanguageJson {
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
