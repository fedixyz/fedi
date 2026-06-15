#!/usr/bin/env node
import fs from 'node:fs'

const agentOutputPath = getArg('--agent-output') || '/tmp/gh-aw/agent_output.json'
const contextPath = getArg('--context') || '/tmp/gh-aw/e2e-audit-context.json'

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

for (const [index, item] of output.items.entries()) {
    const type = normalizeType(item.type || item.kind || item.name || '')
    const text = collectText(item)

    if (type === 'noop' || type === 'create_issue') {
        validateAuditedOutput(index, type, text, item)
        continue
    }

    if (
        type === 'missing_data' ||
        type === 'missing_tool' ||
        type === 'report_incomplete'
    ) {
        validateBlockedOutput(index, type, text)
        continue
    }

    errors.push(`item ${index} has unsupported safe output type: ${type || '<empty>'}`)
}

if (errors.length > 0) {
    fail(errors.join('\n'))
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

    if (type === 'create_issue' && hasIssueLabels(item)) {
        errors.push(
            `item ${index} (${type}) must not set GitHub issue labels; include audit evidence fields in the body and let the workflow apply configured labels automatically`,
        )
    }

    if (type === 'create_issue' && hasConfiguredTitlePrefix(item)) {
        errors.push(
            `item ${index} (${type}) must not include the [e2e audit] issue title prefix; the workflow applies it automatically`,
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
        type === 'create_issue' &&
        fieldHasValue(text, 'coverage_gap_keys', /^(none|n\/a|na)\b/i)
    ) {
        errors.push(
            `item ${index} (${type}) must list concrete coverage_gap_keys for new gaps`,
        )
    }
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
    const value = getFieldValue(text, 'coverage_gaps')
        ?.toLowerCase()
        .replace(/^[\s[\]`_*]+|[\s[\]`_*]+$/g, '')
    if (!value) return false

    if (
        /^(none|none concrete|no concrete gaps?|no meaningful gaps?|no gaps?|no concrete coverage gaps?)(\b|$)/i.test(
            value,
        ) ||
        /^no new (concrete )?gaps?(\b|$)/i.test(
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
