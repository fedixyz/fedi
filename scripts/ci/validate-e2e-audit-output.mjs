#!/usr/bin/env node
import fs from 'node:fs'

const agentOutputPath =
    getArg('--agent-output') || '/tmp/gh-aw/agent_output.json'
const contextPath = getArg('--context') || '/tmp/gh-aw/e2e-audit-context.json'
const patchDir = getArg('--patch-dir') || '/tmp/gh-aw'

// The prompt's testID-only rule for product files is not enforceable via the
// safe-outputs allowed_files globs (they accept any change under screens/
// components), so the patch itself is checked here.
const appiumTestPatchPath = /^ui\/native\/tests\/appium\//
const unconditionalPatchPaths = [
    appiumTestPatchPath,
    /^scripts\/ui\/run-e2e\.sh$/,
]
const testIdOnlyPatchPaths = [
    /^ui\/native\/screens\//,
    /^ui\/native\/components\//,
]

const requiredEvidenceFields = [
    'audit_context_id',
    'review_scope',
    'comparison_boundary',
    'changed_files',
    'appium_tests_inspected',
    'native_surface_inventory',
    'coverage_map',
    'coverage_gaps',
    'coverage_gap_keys',
    'validation_performed',
]

const invalidNoopPatterns = [
    /task instructions received/i,
    /no audit execution performed/i,
    /no action needed.*instructions/i,
    /kicking off/i,
    /locating AGENTS instructions/i,
    /verified required files/i,
    /smoke test/i,
]

const optionalMarkdownFieldMarker = '[\\s*_`]*'

if (process.argv.includes('--self-test')) {
    runSelfTests()
    process.exit(0)
}

const context = readJson(contextPath, 'audit context')
const output = readJson(agentOutputPath, 'agent output')

if (!Array.isArray(output.items)) {
    fail('agent output is missing an items array')
}

if (output.items.length === 0) {
    fail('agent produced no safe output items')
}

if (Array.isArray(output.errors) && output.errors.length > 0) {
    fail(`agent output contains errors: ${JSON.stringify(output.errors)}`)
}

const errors = []
const blockedTypes = []

const itemTypes = output.items.map(item =>
    normalizeType(item.type || item.kind || item.name || ''),
)
if (output.items.length !== 1) {
    errors.push(
        `agent output must contain exactly one final safe output item, found ${output.items.length}: ${itemTypes.join(', ')}`,
    )
}

for (const [index, item] of output.items.entries()) {
    const type = itemTypes[index]
    const text = collectText(item)

    if (
        type === 'noop' ||
        type === 'create_issue' ||
        type === 'create_pull_request'
    ) {
        validateAuditedOutput(index, type, text, item)
        continue
    }

    if (
        type === 'missing_data' ||
        type === 'missing_tool' ||
        type === 'report_incomplete'
    ) {
        validateBlockedOutput(index, type, text)
        blockedTypes.push(type)
        continue
    }

    errors.push(
        `item ${index} has unsupported safe output type: ${type || '<empty>'}`,
    )
}

if (errors.length > 0) {
    fail(errors.join('\n'))
}

// A blocked output is well-formed but means the audit never finished; exit
// non-zero so the run shows red instead of masquerading as a green no-op.
if (blockedTypes.length > 0) {
    fail(
        `audit did not complete: agent ended with ${blockedTypes.join(', ')}; see the safe output details for the blocker`,
    )
}

console.log(
    `validated ${output.items.length} E2E audit safe output item(s) for ${context.audit_context_id}`,
)

function validateAuditedOutput(index, type, text, item) {
    if (!text.includes(context.audit_context_id)) {
        errors.push(
            `item ${index} (${type}) is missing audit_context_id ${context.audit_context_id}`,
        )
    }

    if (!fieldHasValue(text, 'review_scope', /^full-codebase\b/i)) {
        errors.push(
            `item ${index} (${type}) must state review_scope=full-codebase`,
        )
    }

    if (
        (type === 'create_issue' || type === 'create_pull_request') &&
        hasIssueLabels(item)
    ) {
        errors.push(
            `item ${index} (${type}) must not set GitHub labels; include audit evidence fields in the body and let the workflow apply configured labels automatically`,
        )
    }

    if (type === 'create_issue' && hasConfiguredTitlePrefix(item)) {
        errors.push(
            `item ${index} (${type}) must not include the [e2e audit] issue title prefix; the workflow applies it automatically`,
        )
    }

    if (
        type === 'create_pull_request' &&
        /^\s*\[e2e coverage\]/i.test(String(item.title || ''))
    ) {
        errors.push(
            `item ${index} (${type}) must not include the [e2e coverage] title prefix; the workflow applies it automatically`,
        )
    }

    const missingFields = requiredEvidenceFields.filter(
        field => !text.toLowerCase().includes(field),
    )
    if (missingFields.length > 0) {
        errors.push(
            `item ${index} (${type}) is missing evidence fields: ${missingFields.join(', ')}`,
        )
    }

    for (const pattern of invalidNoopPatterns) {
        if (type === 'noop' && pattern.test(text)) {
            errors.push(
                `item ${index} (${type}) looks like a pre-audit placeholder: ${pattern}`,
            )
        }
    }

    if (type === 'noop' && !noopStatesNoConcreteGaps(text)) {
        errors.push(
            `item ${index} (${type}) must state that coverage_gaps has no concrete gaps or that concrete gaps are already tracked; use create_issue for new untracked concrete gaps`,
        )
    }

    if (!fieldHasValue(text, 'coverage_gap_keys', /\S/)) {
        errors.push(
            `item ${index} (${type}) must include non-empty coverage_gap_keys`,
        )
    }

    if (
        (type === 'create_issue' || type === 'create_pull_request') &&
        fieldHasValue(text, 'coverage_gap_keys', /^(none|n\/a|na)\b/i)
    ) {
        errors.push(
            `item ${index} (${type}) must list concrete coverage_gap_keys for new gaps`,
        )
    }

    if (type === 'create_pull_request') {
        validatePullRequestEvidence(index, type, text)
    }
}

// A coverage PR must state what was actually validated and that it passed.
// Device execution is impossible on this runner, so honest bodies name the
// static checks, say they passed, and say device validation is still pending.
function validatePullRequestEvidence(index, type, text) {
    const passWords =
        '(?:pass(?:ed|es)?|clean|succeeded|green|(?:no|0|zero) errors)'
    const statesPass = tool =>
        new RegExp(
            `${tool}[^,;\\n]{0,120}?\\b${passWords}\\b|\\b${passWords}\\b[^,;\\n]{0,120}?${tool}`,
            'i',
        ).test(text)

    if (!statesPass('\\b(tsc|typecheck|type-check|type check)\\b')) {
        errors.push(
            `item ${index} (${type}) must state that the scoped appium typecheck (tsc) ran and passed`,
        )
    }

    if (!statesPass('\\b(eslint|lint)\\b')) {
        errors.push(
            `item ${index} (${type}) must state that eslint ran on the changed files and passed`,
        )
    }

    if (reportsStaticCheckFailure(text)) {
        errors.push(
            `item ${index} (${type}) reports a failed static check; a failed implementation must fall back to create_issue instead of a pull request`,
        )
    }

    if (
        !/device/i.test(text) ||
        !/\b(pending|not (yet )?(run|executed)|was not run|did not run|unable to run|impossible)\b/i.test(
            text,
        )
    ) {
        errors.push(
            `item ${index} (${type}) must state that device validation is pending and was not run in this environment`,
        )
    }

    validatePatchScope(index, type)
}

function reportsStaticCheckFailure(text) {
    const staticTool = '\\b(?:tsc|typecheck|type-check|eslint|lint|prettier)\\b'
    const failure = '\\b(?:fail(?:ed|ing|s)?|error(?:ed|s)? out)\\b'
    return new RegExp(
        `${staticTool}[^;\\n]{0,80}${failure}|${failure}[^;\\n]{0,80}${staticTool}`,
        'i',
    ).test(text)
}

// For product files under screens/components the change must be nothing but
// testID attributes, enforced two ways. A testID value an added line
// introduces must be static (see testIdValuesAreStatic), so it cannot smuggle
// a call that runs at render. And the added and removed lines are compared per
// line after their testIDs are stripped, not as one concatenated blob. A blob
// comparison ignores line boundaries, so an ASI statement-split or an added
// import line would slip through. Test-tree files change freely.
function validatePatchScope(index, type) {
    if (!fs.existsSync(patchDir)) {
        errors.push(
            `item ${index} (${type}) has no patch directory at ${patchDir}; a pull request output requires committed changes`,
        )
        return
    }

    const patchFiles = fs
        .readdirSync(patchDir)
        .filter(name => /^aw[-.].*\.patch$|^aw\.patch$/.test(name))
        .map(name => `${patchDir}/${name}`)

    if (patchFiles.length === 0) {
        errors.push(
            `item ${index} (${type}) has no patch file under ${patchDir}; a pull request output requires committed changes`,
        )
        return
    }

    let touchesAppiumTestTree = false

    for (const file of patchFiles) {
        const sections = parsePatchSections(fs.readFileSync(file, 'utf8'))
        for (const section of sections) {
            const { path, added, removed, hunks, unsupportedReason } = section
            if (!path) {
                errors.push(
                    `item ${index} (${type}) patch contains a file section whose path cannot be parsed safely`,
                )
                continue
            }

            if (unsupportedReason || hunks.length === 0) {
                errors.push(
                    `item ${index} (${type}) patch uses an unsupported non-text or metadata-only change in ${path}${unsupportedReason ? `: ${unsupportedReason}` : ''}`,
                )
                continue
            }

            if (appiumTestPatchPath.test(path) && added.length > 0) {
                touchesAppiumTestTree = true
            }

            if (unconditionalPatchPaths.some(p => p.test(path))) continue

            if (!testIdOnlyPatchPaths.some(p => p.test(path))) {
                errors.push(
                    `item ${index} (${type}) patch touches ${path}, outside the appium test tree and the testID-eligible product paths`,
                )
                continue
            }

            const removedSelector = removed.find(
                line => findTestIdAttrs(line).length,
            )
            if (removedSelector !== undefined) {
                errors.push(
                    `item ${index} (${type}) patch removes or changes an existing testID in ${path}; product files may only gain new testID attributes`,
                )
                continue
            }

            const nonStatic = added.find(line => !testIdValuesAreStatic(line))
            if (nonStatic !== undefined) {
                errors.push(
                    `item ${index} (${type}) patch adds a non-static testID value in ${path}; a testID must be a string literal or a side-effect-free interpolation, not a call to a non-string-building function`,
                )
                continue
            }

            if (!hunks.every(hunkOnlyAddsTestIds)) {
                errors.push(
                    `item ${index} (${type}) patch changes more than testID attributes in ${path}`,
                )
            }
        }
    }

    if (!touchesAppiumTestTree) {
        errors.push(
            `item ${index} (${type}) patch does not touch ui/native/tests/appium/**; a coverage pull request must add or register an Appium test, not only selectors`,
        )
    }
}

function hunkOnlyAddsTestIds(hunk) {
    const oldLines = hunk.lines
        .filter(line => line.kind !== 'added')
        .map(line => line.text)
    const newLines = hunk.lines
        .filter(line => line.kind !== 'removed')
        .flatMap(line => {
            if (line.kind !== 'added') return [line.text]
            const residual = stripTestIdAttributes(line.text)
            return residual.trim().length > 0 ? [residual] : []
        })
    return (
        oldLines.length === newLines.length &&
        oldLines.every((line, index) => line === newLines[index])
    )
}

function stripTestIdAttributes(line) {
    let out = ''
    let cursor = 0
    for (const attr of findTestIdAttrs(line)) {
        out += line.slice(cursor, attr.start)
        cursor = attr.end
        if (/\s/.test(out.at(-1) || '') && /\s/.test(line[cursor] || '')) {
            cursor++
        } else if (
            /\s/.test(out.at(-1) || '') &&
            /[>/]/.test(line[cursor] || '')
        ) {
            out = out.slice(0, -1)
        }
    }
    return out + line.slice(cursor)
}

function testIdValuesAreStatic(line) {
    return findTestIdAttrs(line).every(
        attr => attr.body === undefined || braceBodyIsStatic(attr.body),
    )
}

// Locate every `testID=<value>` on a line, matching the value with balanced
// braces so a nested `${...}` interpolation is captured whole rather than cut
// off at the first inner brace. `body` is the text inside the braces for the
// `testID={...}` form, or undefined for the `testID="..."` string form.
function findTestIdAttrs(line) {
    const attrs = []
    const re = /\btestID\s*=\s*/g
    let match
    while ((match = re.exec(line))) {
        const valueStart = match.index + match[0].length
        const opener = line[valueStart]
        if (opener === '"' || opener === "'") {
            const close = line.indexOf(opener, valueStart + 1)
            if (close === -1) break
            attrs.push({ start: match.index, end: close + 1, body: undefined })
            re.lastIndex = close + 1
        } else if (opener === '{') {
            let depth = 0
            let i = valueStart
            for (; i < line.length; i++) {
                if (line[i] === '{') depth++
                else if (line[i] === '}' && --depth === 0) break
            }
            if (depth !== 0) break
            attrs.push({
                start: match.index,
                end: i + 1,
                body: line.slice(valueStart + 1, i),
            })
            re.lastIndex = i + 1
        }
    }
    return attrs
}

function braceBodyIsStatic(body) {
    const value = body.trim()
    const identifier = '[A-Za-z_$][\\w$]*'
    const dottedPath = `${identifier}(?:\\s*\\.\\s*${identifier})*`
    if (new RegExp(`^${dottedPath}$`).test(value)) return true
    if (templateOnlyReadsDottedPaths(value, dottedPath)) return true

    const stringLiteral = `(?:'(?:\\\\.|[^'\\\\])*'|"(?:\\\\.|[^"\\\\])*")`
    const literalArgs = `(?:${stringLiteral})(?:\\s*,\\s*${stringLiteral})*`
    return new RegExp(
        `^${dottedPath}(?:\\s*\\.\\s*(?:concat|replaceAll)\\(\\s*(?:${literalArgs})?\\s*\\))+$`,
    ).test(value)
}

function templateOnlyReadsDottedPaths(value, dottedPath) {
    if (!value.startsWith('`') || !value.endsWith('`')) return false
    const interpolation = /\$\{([^{}]+)}/g
    let cursor = 1
    let match
    while ((match = interpolation.exec(value))) {
        const literal = value.slice(cursor, match.index)
        if (/[^\\]`/.test(literal)) return false
        if (!new RegExp(`^\\s*${dottedPath}\\s*$`).test(match[1])) return false
        cursor = match.index + match[0].length
    }
    const remainder = value.slice(cursor, -1)
    return !remainder.includes('${') && !/[^\\]`/.test(remainder)
}

function parsePatchSections(patchText) {
    const sections = []
    let current
    let currentHunk

    const finishSection = () => {
        if (!current) return
        current.path =
            current.newPath !== '/dev/null' ? current.newPath : current.oldPath
        current.added = current.hunks.flatMap(hunk =>
            hunk.lines
                .filter(line => line.kind === 'added')
                .map(line => line.text),
        )
        current.removed = current.hunks.flatMap(hunk =>
            hunk.lines
                .filter(line => line.kind === 'removed')
                .map(line => line.text),
        )
        sections.push(current)
    }

    for (const raw of patchText.split('\n')) {
        const diffHeader = raw.match(/^diff --git a\/(\S+) b\/(\S+)$/)
        if (raw.startsWith('diff --git ')) {
            finishSection()
            current = {
                oldPath: diffHeader?.[1],
                newPath: diffHeader?.[2],
                hunks: [],
                unsupportedReason: diffHeader
                    ? undefined
                    : 'quoted or whitespace-containing path',
            }
            currentHunk = undefined
            continue
        }
        if (!current) continue

        if (raw.startsWith('@@')) {
            currentHunk = { lines: [] }
            current.hunks.push(currentHunk)
            continue
        }
        if (currentHunk) {
            if (raw[0] === '+') {
                currentHunk.lines.push({ kind: 'added', text: raw.slice(1) })
            } else if (raw[0] === '-') {
                currentHunk.lines.push({ kind: 'removed', text: raw.slice(1) })
            } else if (raw[0] === ' ') {
                currentHunk.lines.push({ kind: 'context', text: raw.slice(1) })
            }
            continue
        }

        const oldHeader = raw.match(/^--- (?:a\/)?(.+)$/)
        const newHeader = raw.match(/^\+\+\+ (?:b\/)?(.+)$/)
        if (oldHeader) {
            current.oldPath = oldHeader[1]
            currentHunk = undefined
            continue
        }
        if (newHeader) {
            current.newPath = newHeader[1]
            currentHunk = undefined
            continue
        }
        if (
            /^(?:GIT binary patch|Binary files |rename (?:from|to) |copy (?:from|to) |old mode |new mode )/.test(
                raw,
            )
        ) {
            current.unsupportedReason = raw
            continue
        }
    }
    finishSection()
    return sections
}

function runSelfTests() {
    const accepted = [
        '<View testID="Static" />',
        '<View testID={`Row-${item.id}`} />',
        "<View testID={item.name.concat('Row').replaceAll(' ', '')} />",
    ]
    const rejected = [
        '<View testID={`${counter++}`} />',
        "<View testID={'x'.replaceAll('x', callback)} />",
        '<View testID={sendSeed()} />',
    ]
    for (const line of accepted) {
        if (!testIdValuesAreStatic(line))
            throw new Error(`rejected safe testID: ${line}`)
    }
    for (const line of rejected) {
        if (testIdValuesAreStatic(line))
            throw new Error(`accepted unsafe testID: ${line}`)
    }

    const relocation =
        parsePatchSections(`diff --git a/ui/native/screens/Foo.tsx b/ui/native/screens/Foo.tsx
--- a/ui/native/screens/Foo.tsx
+++ b/ui/native/screens/Foo.tsx
@@ -1,2 +1 @@
-dangerousCall()
 keep()
@@ -10 +9,2 @@
 other()
+dangerousCall()`)[0]
    if (relocation.hunks.every(hunkOnlyAddsTestIds)) {
        throw new Error('accepted product-code line relocation')
    }

    const whitespaceChange =
        parsePatchSections(`diff --git a/ui/native/screens/Foo.tsx b/ui/native/screens/Foo.tsx
--- a/ui/native/screens/Foo.tsx
+++ b/ui/native/screens/Foo.tsx
@@ -1 +1 @@
-const label = 'pay now'
+const label = 'paynow'`)[0]
    if (whitespaceChange.hunks.every(hunkOnlyAddsTestIds)) {
        throw new Error('accepted whitespace-only product behavior change')
    }

    const selector =
        parsePatchSections(`diff --git a/ui/native/screens/Foo.tsx b/ui/native/screens/Foo.tsx
--- a/ui/native/screens/Foo.tsx
+++ b/ui/native/screens/Foo.tsx
@@ -1 +1 @@
-<View />
+<View testID="Foo" />`)[0]
    if (!selector.hunks.every(hunkOnlyAddsTestIds)) {
        throw new Error('rejected testID-only product change')
    }

    const headerPrefix =
        parsePatchSections(`diff --git a/ui/native/screens/Foo.tsx b/ui/native/screens/Foo.tsx
--- a/ui/native/screens/Foo.tsx
+++ b/ui/native/screens/Foo.tsx
@@ -1 +1,2 @@
 keep()
+++injected()`)[0]
    if (headerPrefix.added[0] !== '++injected()') {
        throw new Error('misparsed content line as a patch header')
    }
    if (!reportsStaticCheckFailure('failed eslint, then eslint passed')) {
        throw new Error('accepted failed check stated before its tool name')
    }
    console.log('E2E audit validator self-tests passed')
}

function validateBlockedOutput(index, type, text) {
    const usefulBlocker =
        /\b(blocked|cannot|can't|unable|missing|failed|failure|error|required)\b/i.test(
            text,
        )
    if (!usefulBlocker) {
        errors.push(
            `item ${index} (${type}) must explain the blocker or missing requirement`,
        )
    }
}

function collectText(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }
    if (Array.isArray(value)) return value.map(collectText).join('\n')
    if (typeof value === 'object') {
        return Object.entries(value)
            .filter(([key]) => !['labels', 'metadata', 'raw'].includes(key))
            .map(([key, item]) => `${key}: ${collectText(item)}`)
            .join('\n')
    }
    return ''
}

function noopStatesNoConcreteGaps(text) {
    // The multi-sentence extraction matters: a valid noop often opens with
    // "no untracked gap remains" and cites the tracking numbers a sentence
    // later, which a first-period cutoff would drop.
    const value = getFieldValueUntilNextField(text, 'coverage_gaps')
        ?.toLowerCase()
        .replace(/^[\s[\]`_*]+|[\s[\]`_*]+$/g, '')
    if (!value) return false

    if (
        /^(none|none concrete|no concrete gaps?|no meaningful gaps?|no gaps?|no concrete coverage gaps?)(\b|$)/i.test(
            value,
        ) ||
        /^no (new |untracked |remaining )*(concrete |implementable |meaningful )*(coverage )?gaps?(\b|$)/i.test(
            value,
        )
    ) {
        return true
    }

    if (
        /^(all )?(concrete )?(coverage )?gaps? (are )?already tracked\b/i.test(
            value,
        ) ||
        (/\balready tracked\b/i.test(value) &&
            /(\bopen\b.*\bissues?\b|\bissues?\b|#\d+)/i.test(value)) ||
        (/\bmap(?:s|ped)?\s+to\b/i.test(value) &&
            /\b(existing|open)\b.*\bissues?\b.*#\d+/i.test(value)) ||
        /\bno new untracked (concrete )?(coverage )?gaps?\b/i.test(value)
    ) {
        return true
    }

    return false
}

function fieldHasValue(text, field, valuePattern) {
    const value = getFieldValue(text, field)
    return valuePattern.test(value || '')
}

function getFieldValue(text, field) {
    const compact = text.replace(/\s+/g, ' ')
    const match = compact.match(
        new RegExp(
            `\\b${escapeRegExp(field)}\\b${optionalMarkdownFieldMarker}\\s*[:=\\-]\\s*${optionalMarkdownFieldMarker}([^.;]+)`,
            'i',
        ),
    )
    return match?.[1]?.trim()
}

function getFieldValueUntilNextField(text, field) {
    const otherFields = requiredEvidenceFields
        .concat('review_date')
        .filter(name => name !== field)
        .map(escapeRegExp)
        .join('|')
    const compact = text.replace(/\s+/g, ' ')
    const match = compact.match(
        new RegExp(
            `\\b${escapeRegExp(field)}\\b${optionalMarkdownFieldMarker}\\s*[:=\\-]\\s*${optionalMarkdownFieldMarker}(.+?)(?=\\s*\\b(?:${otherFields})\\b\\s*[:=]|$)`,
            'i',
        ),
    )
    return match?.[1]?.trim()
}

function hasIssueLabels(item) {
    if (!Object.hasOwn(item, 'labels')) return false

    const { labels } = item
    if (labels === null || labels === undefined) return false
    if (Array.isArray(labels)) return labels.length > 0
    if (typeof labels === 'string') return labels.trim().length > 0
    return true
}

function hasConfiguredTitlePrefix(item) {
    return /^\s*\[e2e audit\]/i.test(String(item.title || ''))
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeType(type) {
    return String(type).trim().toLowerCase().replaceAll('-', '_')
}

function readJson(file, label) {
    if (!fs.existsSync(file)) {
        fail(`${label} file does not exist: ${file}`)
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
        fail(
            `${label} file is not valid JSON: ${
                error instanceof Error ? error.message : String(error)
            }`,
        )
    }
}

function getArg(name) {
    const index = process.argv.indexOf(name)
    return index === -1 ? undefined : process.argv[index + 1]
}

function fail(message) {
    console.error(`E2E audit output validation failed:\n${message}`)
    process.exit(1)
}
