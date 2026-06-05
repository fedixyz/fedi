#!/usr/bin/env node
import fs from 'node:fs'

const agentOutputPath = getArg('--agent-output') || '/tmp/gh-aw/agent_output.json'
const contextPath = getArg('--context') || '/tmp/gh-aw/e2e-audit-context.json'

const requiredEvidenceLabels = [
    'audit_context_id',
    'review_scope',
    'comparison_boundary',
    'changed_files',
    'appium_tests_inspected',
    'native_surface_inventory',
    'coverage_map',
    'coverage_gaps',
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
        validateAuditedOutput(index, type, text)
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

function validateAuditedOutput(index, type, text) {
    if (!text.includes(context.audit_context_id)) {
        errors.push(
            `item ${index} (${type}) is missing audit_context_id ${context.audit_context_id}`,
        )
    }

    if (!/\breview_scope\b[\s:=\-]*full-codebase\b/i.test(text)) {
        errors.push(
            `item ${index} (${type}) must state review_scope=full-codebase`,
        )
    }

    const missingLabels = requiredEvidenceLabels.filter(
        label => !text.toLowerCase().includes(label),
    )
    if (missingLabels.length > 0) {
        errors.push(
            `item ${index} (${type}) is missing evidence labels: ${missingLabels.join(', ')}`,
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
            `item ${index} (${type}) must state that coverage_gaps has no concrete gaps; use create_issue for concrete gaps`,
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
            .filter(([key]) => !['metadata', 'raw'].includes(key))
            .map(([key, item]) => `${key}: ${collectText(item)}`)
            .join('\n')
    }
    return ''
}

function noopStatesNoConcreteGaps(text) {
    const compact = text.replace(/\s+/g, ' ')
    const coverageGapsMatch = compact.match(/\bcoverage_gaps\b\s*[:=]\s*([^.;]+)/i)
    if (!coverageGapsMatch) return false

    const value = coverageGapsMatch[1].trim().toLowerCase()
    if (
        /^(none|none concrete|no concrete gaps?|no meaningful gaps?|no gaps?|no concrete coverage gaps?)(\b|$)/i.test(
            value,
        )
    ) {
        return true
    }

    return false
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
