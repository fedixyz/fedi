import jsonStringify from 'json-stable-stringify'

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
