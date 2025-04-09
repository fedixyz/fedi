/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

import { i18nLanguages } from '../localization'

interface Translations {
    purposeStrings?: {
        [key: string]: string
    }
}

interface LanguageMapping {
    [langCode: string]: string | string[]
}

/**
 * Generates InfoPlist.strings files from i18next JSON translations
 * with special handling for language variants and mismatching language codes
 */
function generateInfoPlistStrings(localizationsPath?: string): void {
    console.log('🔍 Starting InfoPlist.strings generation...')

    const languages: string[] = Object.keys(i18nLanguages)
    console.log(
        `🌐 Found ${languages.length} languages: ${languages.join(', ')}`,
    )

    const baseLocalizationsPath =
        localizationsPath || path.join(__dirname, '../localization')
    console.log(
        `📂 Looking for localization files in: ${baseLocalizationsPath}`,
    )

    if (!fs.existsSync(baseLocalizationsPath)) {
        console.error(
            `❌ ERROR: Localizations directory does not exist: ${baseLocalizationsPath}`,
        )
        console.log('📋 Debug: Current directory is', process.cwd())
        console.log('📋 Debug: __dirname is', __dirname)
        return
    }

    const languageMapping: LanguageMapping = {
        pt: ['pt-BR'], // Map pt to pt-BR.lproj only for now. Change this when we have EU Portuguese
        es: ['es-419'],
        ara: ['ar-SS'],
        tl: ['fil'],
    }
    console.log('📝 Language mapping:', languageMapping)

    let processedCount = 0

    for (const lang of languages) {
        try {
            const langDir = path.join(baseLocalizationsPath, lang)
            const translationFilePath: string = path.join(
                langDir,
                'common.json',
            )
            console.log(
                `🔍 Looking for translation file: ${translationFilePath}`,
            )

            if (!fs.existsSync(translationFilePath)) {
                console.warn(
                    `⚠️ Warning: Translation file not found: ${translationFilePath}`,
                )
                continue
            }

            console.log(`✅ Found translation file for ${lang}`)
            const translationsRaw: string = fs.readFileSync(
                translationFilePath,
                'utf8',
            )

            try {
                const translations: Translations = JSON.parse(translationsRaw)
                console.log(`✅ Successfully parsed JSON for ${lang}`)

                const purposeStrings = translations.purposeStrings || {}
                const purposeKeysCount = Object.keys(purposeStrings).length

                console.log(
                    `📊 Found ${purposeKeysCount} purpose strings for ${lang}`,
                )

                if (purposeKeysCount === 0) {
                    console.warn(
                        `⚠️ Warning: No purpose strings found in ${lang}/common.json. Make sure 'purposeStrings' property exists and is not empty.`,
                    )
                    console.log(
                        `📋 Debug: Available top-level keys: ${Object.keys(translations).join(', ')}`,
                    )
                    continue
                }

                let content =
                    '/*\n  InfoPlist.strings\n  FediReactNative\n\n  Created by Someone on 01/01/2025.\n\n*/'

                for (const [key, value] of Object.entries(purposeStrings)) {
                    if (value) {
                        content += `\n"${key}" = "${escapePlistString(value)}";`
                        console.log(`  - Added "${key}" purpose string`)
                    }
                }

                if (content.length === 0) {
                    console.warn(
                        `⚠️ Warning: No valid purpose strings found for language ${lang}`,
                    )
                    continue
                }

                const targetDirs: string[] = languageMapping[lang]
                    ? Array.isArray(languageMapping[lang])
                        ? (languageMapping[lang] as string[])
                        : [languageMapping[lang] as string]
                    : [lang === 'en' ? 'en' : lang]

                console.log(
                    `📂 Will write to ${targetDirs.length} target directories for ${lang}: ${targetDirs.join(', ')}`,
                )

                for (const targetLang of targetDirs) {
                    const iosDirName = `${targetLang}.lproj`
                    const outputDir: string = path.join(
                        __dirname,
                        `../../native/ios/${iosDirName}`,
                    )
                    console.log(`📂 Target directory: ${outputDir}`)

                    if (!fs.existsSync(outputDir)) {
                        console.log(`📂 Creating directory: ${outputDir}`)
                        try {
                            fs.mkdirSync(outputDir, { recursive: true })
                            console.log(`✅ Created directory: ${outputDir}`)
                        } catch (dirError) {
                            console.error(
                                `❌ ERROR creating directory ${outputDir}:`,
                                dirError,
                            )
                            continue
                        }
                    }

                    const outputPath: string = path.join(
                        outputDir,
                        'InfoPlist.strings',
                    )
                    console.log(`📄 Writing to file: ${outputPath}`)

                    try {
                        fs.writeFileSync(outputPath, content)
                        console.log(
                            `✅ Successfully wrote InfoPlist.strings for ${targetLang} (${i18nLanguages[lang as keyof typeof i18nLanguages]})`,
                        )
                        processedCount++
                    } catch (writeError) {
                        console.error(
                            `❌ ERROR writing to ${outputPath}:`,
                            writeError,
                        )
                    }
                }
            } catch (parseError) {
                console.error(`❌ ERROR parsing JSON for ${lang}:`, parseError)
                console.log(
                    `📋 Debug: First 100 characters of file: ${translationsRaw.substring(0, 100)}...`,
                )
            }
        } catch (error) {
            console.error(`❌ ERROR processing ${lang}:`, error)
            if (error instanceof Error) {
                console.error(`   ${error.message}`)
                console.error(`   Stack: ${error.stack}`)
            }
        }
    }

    console.log(
        `🏁 Done! Successfully processed ${processedCount} InfoPlist.strings files.`,
    )
    if (processedCount === 0) {
        console.log('\n📋 TROUBLESHOOTING CHECKLIST:')
        console.log(
            '1. Check if localizations directory exists:',
            baseLocalizationsPath,
        )
        console.log(
            '2. Check if your common.json files have a "purposeStrings" property',
        )
        console.log(
            '3. Check if iOS directory exists:',
            path.join(__dirname, `../../native/ios/`),
        )
        console.log('4. Check file permissions for writing to iOS directory')
    }
}

function escapePlistString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

generateInfoPlistStrings()
