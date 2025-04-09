# Autotranslate

Automatically sorts and translates keys in languages based on the `localization/en/common.json` file.

```bash
yarn run i18n:autotranslate <languageCode?>
```

## Syntax

-   `<languageCode>` - optional
    -   If provided, only runs the autotranslation for the specified language
    -   If not provided, runs autotranslation for all languages

## Obtaining a Google Cloud API Key

1. Get a Google Cloud account
2. Create a project
3. Enable the [Cloud Translation API](https://console.cloud.google.com/apis/api/translate.googleapis.com)
4. Go to the [credentials screen](https://console.cloud.google.com/apis/credentials) and create a new API Key credential
5. Run `GOOGLE_TRANSLATE_API_KEY=[key] yarn i18n:autotranslate`
    - You can add a single language as a parameter if you only want to run against one, e.g. `yarn autotranslate es`

## Example Usage

-   `GOOGLE_TRANSLATE_API_KEY=[key] yarn i18n:autotranslate`
-   `GOOGLE_TRANSLATE_API_KEY=[key] yarn i18n:autotranslate es`
-   ```bash
      export GOOGLE_TRANSLATE_API_KEY=[key]
      yarn i18n:autotranslate
    ```

# Export CSV

Exports a CSV file containing all user-facing strings, to be handed off to translators. JSON files in the `localization` folder are used as the input and the generated file is output at `localization/export.csv`.

```bash
yarn run i18n:export-csv <targetLanguage?> <mode?> <excludeEnglish?>
```

## Syntax

-   `<targetLanguage>` - Optional, a 2-3 letter i18n language code
    -   If not provided, all languages will be included in the exported CSV file
    -   For reference of all supported languages, see `ui/common/localization/index.ts`
    -   Examples: `en`, `es`, `fr`, etc
-   `<mode>` - Optional, defaults to `default`
    -   `default` - exports all keys from the translation file in csv format
    -   `missing` - exports only translation keys missing from the specified translation file matching the `<targetLanguage>`. The values for each key exported in this mode are set to empty strings. Must be used with `<targetLanguage>`
-   `<excludeEnglish>` - Optional, defaults to `false`
    -   When provided (`yes` / `true`), excludes the original English translations from the exported CSV file: `Key, Translation (<languageCode>)`
    -   Otherwise, includes the original English translations in the exported CSV file BEFORE the foreign translations: `Key, Original (en), Translation (<languageCode>)`

## Example Usage

-   `yarn run i18n:export-csv`
-   `yarn run i18n:export-csv es`
-   `yarn run i18n:export-csv fr missing yes`
-   `yarn run i18n:export-csv id default true`

# Import CSV

Imports a CSV that matches the format from `yarn run i18n:export-csv`

```bash
yarn run i18n:import-csv <languageCode> <pathToCsv> <mode?> <targetIndex?>
```

## Syntax

-   `<languageCode>` - a 2-3 letter i18n language code
-   `<pathToCsv>` - absolute path to the CSV file to import
-   `<mode>` - Optional, defaults to `additive`
    -   `additive` - inserts/updates new keys from the CSV file into the specified translation file without touching unchanged keys
    -   `overwrite` - completely replaces the specified translation file with the values from the CSV file, removing all keys not present in the CSV file
-   `<targetIndex>` - Optional, defaults to `-1`
    -   If provided, uses the specified index to extract the value from each row of the CSV file
    -   Behaves like the first argument in `Array.prototype.at()` in JavaScript [[docs]](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/at)
    -   Examples:
        -   `words.hello,Hello,Hola`
            -   `-2` -> `Hello` - Second to last column
            -   `-1` -> `Hola` - Last column
            -   `0` -> `words.hello` - Column at index 0
            -   `1` -> `Hello` - Column at index 1
            -   `2` -> `Hola` - Column at index 2
        -   `words.home,Casa`
            -   `-2` -> `words.home` - Second to last column
            -   `-1` -> `Casa` - Last column
            -   `0` -> `words.home` - Column at index 0
            -   `1` -> `Casa` - Column at index 1

## Example Usage

-   `yarn run i18n:import-csv es ~/Downloads/es.csv`
-   `yarn run i18n:import-csv fr ../localization/export.csv overwrite`
-   `yarn run i18n:import-csv id ~/Downloads/es.csv additive 2`

# Cleaning / Identifying Unused Keys

```bash
yarn run i18n:unused [-n]
```

Collects all localization keys and greps the codebase for them to see if they're being used.

If no matches of a key are found, it is automatically removed from the localization files unless prefixed with an item in `protectedPrefixes`.

## Syntax

-   `-n` - optional, dry run
    -   If provided, outputs the number of unused keys found without modifying any files
    -   Modifies translation files by removing unused keys

## Example Usage

-   `yarn run i18n:unused`
-   `yarn run i18n:unused -n`

# Sync InfoPlist.strings

Pulls iOS' purpose strings from localisation files and writes them into appropriate files. Run this whenever we add/update purpose strings.

```bash
yarn run i18n:sync-plist
```
