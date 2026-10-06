/* eslint-disable no-console */
import { execFileSync } from 'child_process'
import fs from 'fs'
import get from 'lodash/get'
import set from 'lodash/set'
import unset from 'lodash/unset'
import path from 'path'

import { i18nLanguages } from '../localization'
import {
    FlattenedLanguageStrings,
    LanguageJson,
    flattenObject,
    formatLanguageJson,
    getLangJson,
    localizationPath,
} from './i18n-utils'

type Baseline = {
    english: FlattenedLanguageStrings
    stale: Record<string, FlattenedLanguageStrings>
}

type Reason = 'missing' | 'stale' | 'copied'

type WorkItem = {
    key: string
    reason: Reason
    english: string
    previousEnglish?: string | null
    current?: string
}

type Work = Record<string, { items: WorkItem[]; remove: string[] }>

const baselinePath = path.join(localizationPath, 'translation-baseline.json')
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: localizationPath,
    encoding: 'utf8',
}).trim()
const locales = Object.keys(i18nLanguages).filter(l => l !== 'en')

const git = (...args: string[]) =>
    execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    })

const repoPath = (file: string) => path.relative(repoRoot, file)

function readBaseline(): Baseline | null {
    if (!fs.existsSync(baselinePath)) return null
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
}

function baselineCommit(): string | null {
    const sha = git('log', '-1', '--format=%H', '--', repoPath(baselinePath))
    if (!sha.trim()) return null
    const shallowFile = path.resolve(
        repoRoot,
        git('rev-parse', '--git-path', 'shallow').trim(),
    )
    if (
        fs.existsSync(shallowFile) &&
        fs.readFileSync(shallowFile, 'utf8').includes(sha.trim())
    ) {
        console.error(
            'This clone is too shallow to find the last sweep commit. Fetch more history, for example git fetch --deepen=1000, and run again.',
        )
        process.exit(1)
    }
    return sha.trim()
}

function localeAt(commit: string, locale: string): FlattenedLanguageStrings {
    const file = repoPath(path.join(localizationPath, locale, 'common.json'))
    try {
        return flattenObject(JSON.parse(git('show', `${commit}:${file}`)))
    } catch {
        return {}
    }
}

function buildWork(): Work {
    const english = flattenObject(getLangJson('en'))
    const baseline = readBaseline()
    const commit = baselineCommit()
    const work: Work = {}

    for (const locale of locales) {
        const current = flattenObject(getLangJson(locale))
        const atBaseline = commit ? localeAt(commit, locale) : current
        const items: WorkItem[] = []

        for (const [key, en] of Object.entries(english)) {
            const value = current[key]
            if (!value) {
                items.push({ key, reason: 'missing', english: en })
            } else if (value !== atBaseline[key]) {
                if (value === en) {
                    items.push({ key, reason: 'copied', english: en })
                }
            } else if (baseline) {
                const source =
                    baseline.stale[locale]?.[key] ?? baseline.english[key]
                if (source !== en) {
                    items.push({
                        key,
                        reason: 'stale',
                        english: en,
                        previousEnglish: source ?? null,
                        current: value,
                    })
                }
            }
        }

        const remove = Object.keys(current).filter(key => !(key in english))
        work[locale] = { items, remove }
    }
    return work
}

const placeholders = (s: string) => (s.match(/\{\{[^{}]+\}\}/g) ?? []).sort()
const tags = (s: string) => (s.match(/<\/?[A-Za-z0-9]+\s*\/?>/g) ?? []).sort()
const lineBreaks = (s: string) => s.split('\n').length - 1

function checkValue(value: unknown, english: string): string | null {
    if (typeof value !== 'string' || !value.trim()) return 'empty value'
    if (placeholders(value).join() !== placeholders(english).join())
        return `placeholders differ from English: ${placeholders(english).join(' ')}`
    if (tags(value).join() !== tags(english).join())
        return `tags differ from English: ${tags(english).join(' ')}`
    if (lineBreaks(value) !== lineBreaks(english))
        return `English has ${lineBreaks(english)} line breaks`
    return null
}

function writeLocale(locale: string, json: LanguageJson) {
    const file = path.join(localizationPath, locale, 'common.json')
    fs.writeFileSync(file, formatLanguageJson(json), 'utf8')
}

function pruneEmpty(json: LanguageJson) {
    for (const [key, value] of Object.entries(json)) {
        if (typeof value === 'string') continue
        pruneEmpty(value)
        if (Object.keys(value).length === 0) delete json[key]
    }
}

function summarize(work: Work) {
    const rows = Object.entries(work).map(([locale, { items, remove }]) => ({
        locale,
        missing: items.filter(i => i.reason === 'missing').length,
        stale: items.filter(i => i.reason === 'stale').length,
        copied: items.filter(i => i.reason === 'copied').length,
        remove: remove.length,
    }))
    console.table(rows)
    return rows
}

function report(outFile?: string) {
    const work = buildWork()
    summarize(work)
    if (outFile) {
        fs.writeFileSync(outFile, JSON.stringify(work, null, 2) + '\n')
        console.info('Wrote the work list to', outFile)
    }
}

function apply(file: string) {
    const translations: Record<string, Record<string, unknown>> = JSON.parse(
        fs.readFileSync(file, 'utf8'),
    )
    const work = buildWork()
    const problems: string[] = []
    const sameAsEnglish: string[] = []

    for (const [locale, values] of Object.entries(translations)) {
        if (!work[locale]) {
            problems.push(`${locale}: not a locale in localization/index.ts`)
            continue
        }
        const allowed = new Map(work[locale].items.map(i => [i.key, i]))
        for (const [key, value] of Object.entries(values)) {
            const item = allowed.get(key)
            if (!item) {
                problems.push(
                    `${locale}: ${key}: not in the work list, so its translation stays as it is`,
                )
                continue
            }
            const problem = checkValue(value, item.english)
            if (problem) problems.push(`${locale}: ${key}: ${problem}`)
            if (value === item.english) sameAsEnglish.push(`${locale}: ${key}`)
        }
    }

    if (sameAsEnglish.length) {
        console.warn(
            `${sameAsEnglish.length} values are the English text. Keep only the ones the locale deliberately leaves in English:`,
        )
        sameAsEnglish.forEach(s => console.warn(s))
    }

    if (problems.length) {
        problems.forEach(p => console.error(p))
        console.error(`${problems.length} problems, nothing written`)
        process.exit(1)
    }

    for (const [locale, values] of Object.entries(translations)) {
        const json = getLangJson(locale)
        for (const [key, value] of Object.entries(values)) {
            if (get(json, key) !== value) set(json, key, value)
        }
        writeLocale(locale, json)
        console.info(`${locale}: ${Object.keys(values).length} values written`)
    }
}

function finish() {
    const work = buildWork()
    const rows = summarize(work)
    const open = rows.filter(r => r.missing || r.stale)
    if (open.length) {
        console.error(
            `Missing or stale translations remain in ${open.map(r => r.locale).join(', ')}. Apply them before finishing.`,
        )
        process.exit(1)
    }

    for (const [locale, { remove }] of Object.entries(work)) {
        if (!remove.length) continue
        const json = getLangJson(locale)
        remove.forEach(key => unset(json, key))
        pruneEmpty(json)
        writeLocale(locale, json)
        console.info(
            `${locale}: removed ${remove.length} keys English no longer has`,
        )
    }

    const english = flattenObject(getLangJson('en'))
    const sorted = Object.fromEntries(
        Object.keys(english)
            .sort()
            .map(key => [key, english[key]]),
    )
    const baseline: Baseline = { english: sorted, stale: {} }
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 4) + '\n')
    console.info('Wrote', repoPath(baselinePath))
}

const [command, arg] = process.argv.slice(2)
if (command === 'report') report(arg)
else if (command === 'apply' && arg) apply(path.resolve(arg))
else if (command === 'finish') finish()
else {
    console.error(
        'usage: yarn i18n:sweep report [work.json] | apply <translations.json> | finish',
    )
    process.exit(1)
}
