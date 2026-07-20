#!/usr/bin/env node
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const outputDir = getArg('--output-dir') || '/tmp/gh-aw'
const workflowFile =
    process.env.GITHUB_WORKFLOW_FILE ||
    '.github/workflows/daily-e2e-coverage-check.lock.yml'
const workflowApiIdentifier = path.basename(workflowFile)

const repo = process.env.GITHUB_REPOSITORY || ''
const [owner, repoName] = repo.split('/')
const runId = process.env.GITHUB_RUN_ID || ''
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || ''
const currentSha = process.env.GITHUB_SHA || git('rev-parse HEAD')
const refName = process.env.GITHUB_REF_NAME || ''
const token =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GH_AW_GITHUB_TOKEN ||
    ''
const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com'

if (!repo || !owner || !repoName) {
    throw new Error('GITHUB_REPOSITORY is required')
}

fs.mkdirSync(outputDir, { recursive: true })

const previousRun = await findPreviousSuccessfulRun()
const comparison = await buildComparison(previousRun)
const inventory = buildAppiumInventory()
const nativeSurfaceInventory = buildNativeSurfaceInventory()
const openE2ECoverageIssues = await findOpenE2ECoverageIssues()
const openE2ECoveragePrs = await findOpenE2ECoveragePrs()
const auditContext = {
    schema: 'e2e_audit_context_v1',
    audit_context_id: `e2e_audit_context_v1:${runId || 'local'}:${currentSha.slice(0, 12)}`,
    generated_at: new Date().toISOString(),
    repository: repo,
    workflow_file: workflowFile,
    review_scope: {
        mode: 'full-codebase',
        reason: 'Daily E2E coverage audits review the full native user-facing surface; recent changes are supporting context only.',
    },
    current: {
        run_id: runId,
        run_attempt: runAttempt,
        ref_name: refName,
        sha: currentSha,
    },
    comparison_boundary: comparison.boundary,
    changed_files: comparison.changed_files,
    changed_commits: comparison.changed_commits,
    merged_pull_requests: comparison.merged_pull_requests,
    open_e2e_coverage_issues: openE2ECoverageIssues,
    open_e2e_coverage_prs: openE2ECoveragePrs,
    appium_inventory: inventory,
    native_surface_inventory: nativeSurfaceInventory,
}

const jsonPath = path.join(outputDir, 'e2e-audit-context.json')
const markdownPath = path.join(outputDir, 'e2e-audit-context.md')
fs.writeFileSync(jsonPath, `${JSON.stringify(auditContext, null, 2)}\n`)
fs.writeFileSync(markdownPath, renderMarkdown(auditContext))

console.log(`Wrote ${jsonPath}`)
console.log(`Wrote ${markdownPath}`)
console.log(`audit_context_id=${auditContext.audit_context_id}`)
console.log(`review_scope=${auditContext.review_scope.mode}`)
console.log(`changed_files=${auditContext.changed_files.length}`)
console.log(
    `open_e2e_coverage_issues=${auditContext.open_e2e_coverage_issues.length}`,
)
console.log(`open_e2e_coverage_prs=${auditContext.open_e2e_coverage_prs.length}`)
console.log(`appium_tests=${auditContext.appium_inventory.test_files.length}`)
console.log(`native_surface_groups=${auditContext.native_surface_inventory.length}`)

appendStepSummary(renderStepSummaryIntro(auditContext))

// This intro is the first block of the agent job's step summary: a plain
// description for readers with no gh-aw context, ahead of the harness
// diagnostics the bundled gh-aw steps append after the agent runs. The
// validator appends the matching "What this run did" outcome section.
function renderStepSummaryIntro(context) {
    const inventory = context.appium_inventory
    const surfaceFiles = context.native_surface_inventory.reduce(
        (total, group) => total + group.file_count,
        0,
    )
    return `## The daily e2e coverage audit

Once a day this workflow has an AI agent compare the native app's user-facing flows against the Appium e2e test suite and act on the most valuable coverage gap: open a draft PR implementing the missing test, file an \`[e2e audit]\` issue for a gap nobody tracks yet, or record that there is nothing new to do.

This \`agent\` job is the audit itself. The outcome is under **What this run did** below; everything else on this page is diagnostics from the agent harness (tool calls, network firewall, token usage).

**Checked this run:** ${inventory.test_files.length} Appium test suites against ${surfaceFiles} native source files in ${context.native_surface_inventory.length} surface groups, with ${context.open_e2e_coverage_issues.length} open e2e issues and ${context.open_e2e_coverage_prs.length} open e2e PRs counting as already-tracked gaps.

`
}

function appendStepSummary(markdown) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY
    if (!summaryPath) return
    fs.appendFileSync(summaryPath, markdown)
}

function getArg(name) {
    const index = process.argv.indexOf(name)
    return index === -1 ? undefined : process.argv[index + 1]
}

function git(command) {
    try {
        return execSync(`git ${command}`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
    } catch {
        return ''
    }
}

async function github(pathname) {
    if (!token) return undefined
    const response = await fetch(`${apiUrl}${pathname}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            Accept: 'application/vnd.github+json',
        },
    })
    if (!response.ok) {
        throw new Error(
            `GitHub API ${pathname} failed: ${response.status} ${await response.text()}`,
        )
    }
    return response.json()
}

async function findPreviousSuccessfulRun() {
    const workflow = encodeURIComponent(workflowApiIdentifier)
    const branch = refName ? `&branch=${encodeURIComponent(refName)}` : ''
    try {
        const data = await github(
            `/repos/${owner}/${repoName}/actions/workflows/${workflow}/runs?status=success&per_page=20${branch}`,
        )
        return data?.workflow_runs?.find(
            run =>
                String(run.id) !== String(runId) &&
                run.status === 'completed' &&
                run.conclusion === 'success',
        )
    } catch (error) {
        return {
            lookup_error: error instanceof Error ? error.message : String(error),
        }
    }
}

async function buildComparison(previousRun) {
    if (!previousRun || previousRun.lookup_error) {
        return {
            boundary: {
                mode: 'full-scope',
                reason: previousRun?.lookup_error
                    ? 'previous_successful_run_lookup_failed'
                    : 'no_previous_successful_run_found',
                lookup_error: previousRun?.lookup_error,
            },
            changed_files: [],
            changed_commits: [],
            merged_pull_requests: [],
        }
    }

    const boundary = {
        mode: 'incremental',
        previous_successful_run_id: previousRun.id,
        previous_successful_run_url: previousRun.html_url,
        previous_successful_run_sha: previousRun.head_sha,
        previous_successful_run_completed_at: previousRun.updated_at,
    }

    let changedFiles = []
    let changedCommits = []
    if (previousRun.head_sha && currentSha) {
        try {
            const compare = await github(
                `/repos/${owner}/${repoName}/compare/${previousRun.head_sha}...${currentSha}`,
            )
            changedFiles = (compare?.files || []).map(file => ({
                filename: file.filename,
                status: file.status,
                additions: file.additions,
                deletions: file.deletions,
                changes: file.changes,
            }))
            changedCommits = (compare?.commits || []).map(commit => ({
                sha: commit.sha,
                message: commit.commit?.message?.split('\n')[0] || '',
                author_date: commit.commit?.author?.date || '',
            }))
        } catch (error) {
            boundary.compare_error =
                error instanceof Error ? error.message : String(error)
        }
    }

    const mergedPullRequests = await findMergedPullRequests(previousRun.updated_at)
    return {
        boundary,
        changed_files: changedFiles,
        changed_commits: changedCommits,
        merged_pull_requests: mergedPullRequests,
    }
}

async function findMergedPullRequests(since) {
    if (!since) return []
    const date = since.slice(0, 10)
    const query = encodeURIComponent(
        `repo:${repo} is:pr is:merged merged:>=${date}`,
    )
    try {
        const data = await github(
            `/search/issues?q=${query}&sort=updated&order=desc&per_page=20`,
        )
        return (data?.items || []).map(item => ({
            number: item.number,
            title: item.title,
            url: item.html_url,
            updated_at: item.updated_at,
        }))
    } catch (error) {
        return [
            {
                lookup_error:
                    error instanceof Error ? error.message : String(error),
            },
        ]
    }
}

// The dedupe corpus is every open issue carrying the "e2e testing" label,
// not just prior auto-generated "[e2e audit]" reports: hand-written coverage
// issues track the same gaps, and dedupe that can't see them files duplicates.
async function findOpenE2ECoverageIssues() {
    if (!token) return []

    try {
        const items = await searchAllIssues(
            `repo:${repo} is:issue is:open label:"e2e testing"`,
        )

        return Promise.all(items.map(summarizeOpenE2ECoverageIssue))
    } catch (error) {
        return [
            {
                lookup_error:
                    error instanceof Error ? error.message : String(error),
            },
        ]
    }
}

// Search results cap at 100 per page; a corpus past that would silently
// truncate the dedupe context and let the audit file duplicates, so walk
// the pages until a short one.
async function searchAllIssues(query, maxPages = 5) {
    const items = []
    for (let page = 1; page <= maxPages; page++) {
        const data = await github(
            `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`,
        )
        const pageItems = data?.items || []
        items.push(...pageItems)
        if (pageItems.length < 100) return items
    }
    console.warn(`search truncated at ${items.length} results: ${query}`)
    return items
}

// An open [e2e coverage] PR means the gap fix is already in flight; dedupe
// must see it or the workflow re-attempts the same gap every run until merge.
async function findOpenE2ECoveragePrs() {
    if (!token) return []

    const queries = [
        `repo:${repo} is:pr is:open label:"e2e testing"`,
        `repo:${repo} is:pr is:open "[e2e coverage]" in:title`,
    ]
    try {
        const itemsByNumber = new Map()
        for (const query of queries) {
            for (const item of await searchAllIssues(query)) {
                if (!itemsByNumber.has(item.number)) {
                    itemsByNumber.set(item.number, item)
                }
            }
        }

        // PRs are issues to the REST API, so the issue summarizer works as-is.
        return Promise.all(
            [...itemsByNumber.values()].map(summarizeOpenE2ECoverageIssue),
        )
    } catch (error) {
        return [
            {
                lookup_error:
                    error instanceof Error ? error.message : String(error),
            },
        ]
    }
}

async function summarizeOpenE2ECoverageIssue(item) {
    let issue = item
    let detailLookupError
    try {
        issue = (await github(
            `/repos/${owner}/${repoName}/issues/${item.number}`,
        )) || item
    } catch (error) {
        detailLookupError = error instanceof Error ? error.message : String(error)
    }

    const body = String(issue.body || item.body || '')
    const title = String(item.title || issue.title || '')
    const coverageGapsSummary = extractCoverageGapsSummary(body)

    return {
        number: item.number,
        title,
        url: item.html_url || issue.html_url || '',
        created_at: item.created_at || issue.created_at || '',
        updated_at: item.updated_at || issue.updated_at || '',
        labels: (issue.labels || item.labels || []).map(label => label.name),
        // Pattern-match on the body too: hand-written issues have no explicit
        // coverage_gap_keys field, and their titles alone often miss the flow.
        coverage_gap_keys: extractCoverageGapKeys(
            `${title}\n${coverageGapsSummary}\n${body}`,
            body,
        ),
        coverage_gaps_summary: coverageGapsSummary,
        body_excerpt: extractBodyExcerpt(body),
        detail_lookup_error: detailLookupError,
    }
}

function extractCoverageGapKeys(text, explicitText = text) {
    const explicit = getFieldValue(explicitText, 'coverage_gap_keys')
    if (explicit) {
        const keys = normalizeGapKeys(explicit)
        if (keys.length) return keys
    }

    const keyPatterns = [
        {
            key: 'payments',
            pattern:
                /\b(payments?|send\/receive|send receive|send and receive|lightning|on-?chain|ecash|cashu)\b/i,
        },
        {
            key: 'scanner',
            pattern: /\b(scanner|omni|qr|deeplink|deep link)\b/i,
        },
        {
            key: 'pin',
            pattern: /\b(pin|lock screen|lockscreen|unlock|reset pin)\b/i,
        },
        {
            key: 'stability_pool',
            pattern:
                /\b(stability pool|stabilityreceive|stabilitysend|stabilityconfirm|deposit|withdraw)\b/i,
        },
        {
            key: 'tab_navigation',
            pattern:
                /\b(tab navigation|tab-shell|tabsnavigator|bottom-tab|bottom tab|app shell|navigation regression|tabs? switching)\b/i,
        },
        {
            key: 'multispend',
            pattern: /\bmultispend\b/i,
        },
        {
            key: 'chat',
            pattern:
                /\b(chat|message|knock|group chat|chat room|matrix room)\b/i,
        },
        {
            key: 'recovery',
            pattern:
                /\b(recovery|recover|seed words?|restore|device transfer|backup)\b/i,
        },
        {
            key: 'social_backup',
            pattern: /\b(social backup|social recovery|guardian)\b/i,
        },
        {
            key: 'onboarding',
            pattern: /\bonboard/i,
        },
        {
            key: 'settings',
            pattern: /\bsettings\b/i,
        },
        {
            key: 'fedimod_browser',
            pattern: /\b(mini apps?|fedimods?|mods? browser|in-app browser)\b/i,
        },
    ]

    return keyPatterns
        .filter(({ pattern }) => pattern.test(text))
        .map(({ key }) => key)
}

function normalizeGapKeys(value) {
    return [
        ...new Set(
            String(value)
                .replace(/\s*\([^)]*\)\s*$/, '')
                .split(/[,;|/]+|\s+and\s+|\s+/i)
                .map(key =>
                    key
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9_-]+/g, '_')
                        .replace(/^_+|_+$/g, ''),
                )
                .filter(
                    key =>
                        key &&
                        !['none', 'n_a', 'na', 'no', 'new', 'untracked'].includes(
                            key,
                        ),
                ),
        ),
    ].slice(0, 20)
}

function extractCoverageGapsSummary(body) {
    const match = String(body).match(
        /\bcoverage_gaps\b\s*[:=-]\s*([\s\S]*?)(?:\n\s*\b(?:coverage_gap_keys|validation_performed|review_date)\b\s*[:=-]|\n\s*<!--|$)/i,
    )
    return oneLine(match?.[1] || '').slice(0, 700)
}

function extractBodyExcerpt(body) {
    return (
        String(body)
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(line => line && !line.startsWith('<!--')) || ''
    ).slice(0, 240)
}

function getFieldValue(text, field) {
    const match = String(text)
        .match(
            new RegExp(
                `^\\s*(?:[-*]\\s*)?[\\s_*\`]*${escapeRegExp(field)}[\\s_*\`]*\\s*[:=\\-]\\s*(.*?)\\s*$`,
                'im',
            ),
        )
    return match?.[1]?.trim()
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function oneLine(value) {
    return String(value).replace(/\s+/g, ' ').trim()
}

function buildAppiumInventory() {
    const registryPath = 'ui/native/tests/appium/registry.ts'
    const runnerPath = 'ui/native/tests/appium/runner.ts'
    const commonDir = 'ui/native/tests/appium/common'
    const fixtureDir = 'ui/native/tests/appium/fixtures'
    const configDir = 'ui/native/tests/configs/appium'
    const runnerScripts = [
        '.github/workflows/e2e-tests.yml',
        'scripts/ci/e2e-pipeline.sh',
        'scripts/ui/run-e2e.sh',
        'scripts/ui/run-android-e2e.sh',
        'scripts/ui/run-ios-e2e.sh',
    ]

    for (const requiredPath of [registryPath, runnerPath, commonDir]) {
        if (!fs.existsSync(requiredPath)) {
            throw new Error(`Required Appium audit path missing: ${requiredPath}`)
        }
    }

    const registrySource = fs.readFileSync(registryPath, 'utf8')
    const availableTests = []
    const availableTestsBlockMatch = registrySource.match(
        /availableTests:[\s\S]*?=\s*{([\s\S]*?)\r?\n\s*}/,
    )
    if (!availableTestsBlockMatch) {
        throw new Error(`Could not parse availableTests block in ${registryPath}`)
    }

    const availableTestsBlock = availableTestsBlockMatch[1]
    for (const match of availableTestsBlock.matchAll(
        /^\s*([A-Za-z0-9_]+):\s*([A-Za-z0-9_]+)/gm,
    )) {
        availableTests.push({
            test_name: match[1],
            class_name: match[2],
        })
    }
    if (availableTests.length === 0) {
        throw new Error(`No Appium availableTests entries parsed from ${registryPath}`)
    }

    const testFiles = listFiles(commonDir, file => file.endsWith('.test.ts')).map(
        file => {
            const source = fs.readFileSync(file, 'utf8')
            return {
                path: file,
                classes: [...source.matchAll(/export\s+class\s+(\w+)/g)].map(
                    match => match[1],
                ),
                prerequisites:
                    source
                        .match(/static prerequisites = \[([^\]]*)]/)?.[1]
                        ?.replaceAll("'", '')
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean) || [],
                produces:
                    source
                        .match(/static produces = \[([^\]]*)]/)?.[1]
                        ?.replaceAll("'", '')
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean) || [],
                actors: Number(source.match(/static actors = (\d+)/)?.[1] || 1),
            }
        },
    )

    if (testFiles.length === 0) {
        throw new Error(`No Appium test files found in ${commonDir}`)
    }

    return {
        registry: {
            path: registryPath,
            available_tests: availableTests,
        },
        runner: {
            path: runnerPath,
            exists: true,
        },
        test_files: testFiles,
        fixtures: fs.existsSync(fixtureDir)
            ? listFiles(fixtureDir, file => file.endsWith('.ts'))
            : [],
        configs: fs.existsSync(configDir)
            ? listFiles(configDir, file => file.endsWith('.ts'))
            : [],
        runner_scripts: runnerScripts.map(file => ({
            path: file,
            exists: fs.existsSync(file),
        })),
    }
}

function buildNativeSurfaceInventory() {
    const groups = [
        {
            name: 'native_screens',
            roots: ['ui/native/screens'],
        },
        {
            name: 'native_feature_components',
            roots: ['ui/native/components/feature'],
        },
        {
            name: 'native_navigation_and_app_shell',
            roots: [
                'ui/native/App.tsx',
                'ui/native/Router.tsx',
                'ui/native/components/navigation',
            ],
        },
        {
            name: 'native_state_and_utils',
            roots: ['ui/native/state', 'ui/native/utils'],
        },
        {
            name: 'common_native_flow_logic',
            roots: [
                'ui/common/hooks',
                'ui/common/redux',
                'ui/common/utils',
                'ui/common/types',
            ],
        },
    ]

    return groups.map(group => {
        const files = group.roots.flatMap(root => listSourcePath(root))
        return {
            name: group.name,
            roots: group.roots,
            file_count: files.length,
            files,
        }
    })
}

function listFiles(dir, predicate) {
    const results = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            results.push(...listFiles(fullPath, predicate))
        } else if (predicate(fullPath)) {
            results.push(fullPath)
        }
    }
    return results.sort()
}

function listSourcePath(sourcePath) {
    if (!fs.existsSync(sourcePath)) return []
    const stats = fs.statSync(sourcePath)
    if (stats.isFile()) {
        return isSourceFile(sourcePath) ? [sourcePath] : []
    }
    if (!stats.isDirectory()) return []
    return listFiles(sourcePath, isSourceFile)
}

function isSourceFile(file) {
    return (
        /\.(ts|tsx|js|jsx)$/.test(file) &&
        !/(\.test|\.spec)\.(ts|tsx|js|jsx)$/.test(file)
    )
}

function renderMarkdown(context) {
    const inventory = context.appium_inventory
    const nativeSurface = context.native_surface_inventory
    const changedFiles = context.changed_files.slice(0, 150)
    const changedCommits = context.changed_commits.slice(0, 50)
    const mergedPrs = context.merged_pull_requests.slice(0, 30)
    const openE2ECoverageIssues = context.open_e2e_coverage_issues.slice(0, 100)
    const openE2ECoveragePrs = (context.open_e2e_coverage_prs || []).slice(
        0,
        100,
    )
    const trackedGapKeys = [
        ...new Set(
            [...openE2ECoverageIssues, ...openE2ECoveragePrs].flatMap(
                item => item.coverage_gap_keys || [],
            ),
        ),
    ].sort()
    return `# Deterministic E2E Audit Context

audit_context_id: ${context.audit_context_id}
generated_at: ${context.generated_at}
repository: ${context.repository}
workflow_file: ${context.workflow_file}
current_run_id: ${context.current.run_id}
current_sha: ${context.current.sha}

## Review Scope

- mode: ${context.review_scope.mode}
- reason: ${context.review_scope.reason}

## Comparison Boundary

${renderObject(context.comparison_boundary)}

Changed files and pull requests are supporting context only. They must not limit the audit scope.

## Changed Files

${renderList(changedFiles.map(file => `${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`))}

## Changed Commits

${renderList(changedCommits.map(commit => `${commit.sha.slice(0, 12)} ${commit.message}`))}

## Merged Pull Requests

${renderList(mergedPrs.map(pr => (pr.lookup_error ? `lookup_error: ${pr.lookup_error}` : `#${pr.number} ${pr.title} ${pr.url}`)))}

## Open E2E Coverage Issues

Every open issue labeled "e2e testing", auto-generated and hand-written alike. These issues gate re-filing only: never create a new issue for a gap any of them already tracks, and cite the issue number instead. They do not gate implementation; treat them as the work queue and prefer implementing a gap one of them tracks. tracked_coverage_gap_keys aggregates the open issues here and the open PRs in the next section.

tracked_coverage_gap_keys=${trackedGapKeys.join(',') || 'none'}

${renderList(openE2ECoverageIssues.map(renderOpenE2ECoverageIssue))}

## Open E2E Coverage PRs

Every open pull request labeled "e2e testing" or title-prefixed "[e2e coverage]". A gap with an open PR here already has a fix in flight: treat it as tracked, do not implement or re-report it, and cite the PR number instead.

${renderList(openE2ECoveragePrs.map(renderOpenE2ECoverageIssue))}

## Appium Tests Inspected

Registry: ${inventory.registry.path}
Runner: ${inventory.runner.path}
Available tests:
${renderList(inventory.registry.available_tests.map(test => `${test.test_name} -> ${test.class_name}`))}

Test files:
${renderList(inventory.test_files.map(file => `${file.path}: classes=${file.classes.join(', ') || 'unknown'} prerequisites=${file.prerequisites.join('|') || 'none'} produces=${file.produces.join('|') || 'none'} actors=${file.actors}`))}

Fixtures:
${renderList(inventory.fixtures)}

Configs:
${renderList(inventory.configs)}

Runner scripts:
${renderList(inventory.runner_scripts.map(script => `${script.path}: ${script.exists ? 'present' : 'missing'}`))}

## Native Surface Inventory

${nativeSurface.map(renderNativeSurfaceGroup).join('\n\n')}

## Required Safe Output Evidence

Any final safe output for this workflow must include the exact audit_context_id above plus these labels:

- audit_context_id
- review_scope
- comparison_boundary
- changed_files
- appium_tests_inspected
- native_surface_inventory
- coverage_map
- coverage_gaps
- coverage_gap_keys
- validation_performed

If the audit cannot continue from this context, use report_incomplete or missing_data with the blocker and the last successful inspection step.
`
}

function renderObject(value) {
    return Object.entries(value)
        .map(([key, item]) => `- ${key}: ${item ?? ''}`)
        .join('\n')
}

function renderList(items) {
    if (!items.length) return '- none'
    return items.map(item => `- ${item}`).join('\n')
}

function renderOpenE2ECoverageIssue(issue) {
    if (issue.lookup_error) return `lookup_error: ${issue.lookup_error}`

    const keys = issue.coverage_gap_keys?.length
        ? issue.coverage_gap_keys.join(',')
        : 'unknown'
    const summary =
        issue.coverage_gaps_summary || issue.body_excerpt || 'no body summary captured'
    const detailLookup = issue.detail_lookup_error
        ? `; detail_lookup_error=${issue.detail_lookup_error}`
        : ''

    return `#${issue.number} ${issue.title} ${issue.url}; coverage_gap_keys=${keys}; coverage_gaps_summary=${summary}${detailLookup}`
}

function renderNativeSurfaceGroup(group) {
    const files = group.files.slice(0, 200)
    const omitted = group.files.length - files.length
    return `### ${group.name}

Roots: ${group.roots.join(', ')}
File count: ${group.file_count}
Files:
${renderList(files)}${omitted > 0 ? `\n- ... ${omitted} more` : ''}`
}
