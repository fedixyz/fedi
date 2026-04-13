export interface ParsedXmlNode {
    tagName: string
    attributes: Record<string, string>
    children: ParsedXmlNode[]
}

export interface Bounds {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
}

export interface NormalizedA11yNode {
    type: string
    role: string
    label?: string
    name?: string
    value?: string
    text?: string
    visible: boolean
    enabled: boolean
    hittable: boolean
    bounds?: Bounds
    children: NormalizedA11yNode[]
}

const INTERACTIVE_ROLES = new Set([
    'Button',
    'Cell',
    'Image',
    'Key',
    'Link',
    'SearchField',
    'SecureTextField',
    'SegmentedControl',
    'Slider',
    'StaticText',
    'Stepper',
    'Switch',
    'TabBar',
    'TextField',
    'TextView',
])

export function parseAppiumPageSource(xml: string): ParsedXmlNode[] {
    const root: ParsedXmlNode = {
        tagName: '__root__',
        attributes: {},
        children: [],
    }
    const stack: ParsedXmlNode[] = [root]
    const tokenPattern =
        /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>|[^<]+/g
    const tokens = xml.match(tokenPattern) || []

    for (const token of tokens) {
        if (
            token.startsWith('<?') ||
            token.startsWith('<!--') ||
            token.startsWith('<![CDATA[')
        ) {
            continue
        }

        if (token.startsWith('</')) {
            if (stack.length > 1) {
                stack.pop()
            }
            continue
        }

        if (!token.startsWith('<')) {
            continue
        }

        const selfClosing = token.endsWith('/>')
        const content = token
            .slice(1, token.length - (selfClosing ? 2 : 1))
            .trim()

        if (!content || content.startsWith('!')) {
            continue
        }

        const nameMatch = content.match(/^([^\s/>]+)/)
        if (!nameMatch) {
            continue
        }

        const tagName = nameMatch[1]
        const attributes = parseAttributes(content.slice(tagName.length))
        const node: ParsedXmlNode = {
            tagName,
            attributes,
            children: [],
        }

        stack[stack.length - 1].children.push(node)

        if (!selfClosing) {
            stack.push(node)
        }
    }

    return root.children
}

export function normalizeAppiumPageSource(xml: string): NormalizedA11yNode[] {
    return compactNodes(parseAppiumPageSource(xml).map(normalizeNode))
}

export function formatNormalizedA11yTree(
    nodes: NormalizedA11yNode[],
    includeAll = false,
): string {
    const lines: string[] = []

    const visit = (node: NormalizedA11yNode, depth: number) => {
        const shouldPrint = includeAll || shouldPrintNode(node, depth)

        if (shouldPrint) {
            lines.push(`${'  '.repeat(depth)}${formatNode(node)}`)
        }

        const nextDepth = shouldPrint ? depth + 1 : depth
        node.children.forEach(child => visit(child, nextDepth))
    }

    nodes.forEach(node => visit(node, 0))

    return lines.join('\n')
}

export function findNodeByExactText(
    nodes: NormalizedA11yNode[],
    text: string,
): NormalizedA11yNode | undefined {
    const matches: NormalizedA11yNode[] = []

    const visit = (node: NormalizedA11yNode) => {
        if (!node.visible) {
            return
        }

        const values = [node.text, node.label, node.name, node.value]
            .filter(Boolean)
            .map(value => value?.trim())

        if (values.includes(text)) {
            matches.push(node)
        }

        node.children.forEach(visit)
    }

    nodes.forEach(visit)

    return matches.sort(compareNodesForTapTarget)[0]
}

export function getTapPoint(
    node: NormalizedA11yNode,
): { x: number; y: number } | undefined {
    if (!node.bounds) {
        return undefined
    }

    return {
        x: Math.round((node.bounds.left + node.bounds.right) / 2),
        y: Math.round((node.bounds.top + node.bounds.bottom) / 2),
    }
}

function parseAttributes(source: string): Record<string, string> {
    const attributes: Record<string, string> = {}
    const attributePattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g

    let match: RegExpExecArray | null
    while ((match = attributePattern.exec(source)) !== null) {
        attributes[match[1]] = match[3] ?? match[4] ?? ''
    }

    return attributes
}

function normalizeNode(node: ParsedXmlNode): NormalizedA11yNode {
    const type = node.attributes.type || node.tagName
    const role = type.replace(/^XCUIElementType/, '') || type
    const label = cleanString(node.attributes.label)
    const name = cleanString(node.attributes.name)
    const value = cleanString(node.attributes.value)
    const children = node.children.map(normalizeNode)
    const text = selectDisplayText(role, { label, name, value }, children)

    return {
        type,
        role,
        label,
        name,
        value,
        text,
        visible: parseBoolean(node.attributes.visible, true),
        enabled: parseBoolean(node.attributes.enabled, true),
        hittable: parseBoolean(node.attributes.hittable, true),
        bounds: parseBounds(node.attributes),
        children,
    }
}

function cleanString(value?: string): string | undefined {
    if (value === undefined) {
        return undefined
    }

    const trimmed = decodeHtmlEntities(value).replace(/\s+/g, ' ').trim()
    return trimmed.length > 0 ? trimmed : undefined
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback
    }

    return value.toLowerCase() === 'true'
}

function parseBounds(attributes: Record<string, string>): Bounds | undefined {
    const x = parseNumber(attributes.x)
    const y = parseNumber(attributes.y)
    const width = parseNumber(attributes.width)
    const height = parseNumber(attributes.height)

    if (
        x !== undefined &&
        y !== undefined &&
        width !== undefined &&
        height !== undefined
    ) {
        return {
            left: Math.round(x),
            top: Math.round(y),
            right: Math.round(x + width),
            bottom: Math.round(y + height),
            width: Math.round(width),
            height: Math.round(height),
        }
    }

    const rect = attributes.rect || attributes.frame
    if (!rect) {
        return undefined
    }

    const rectMatch = rect.match(
        /\{\{\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\},\s*\{\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\}\}/,
    )
    if (!rectMatch) {
        return undefined
    }

    const [, rectX, rectY, rectWidth, rectHeight] = rectMatch
    return {
        left: Math.round(Number(rectX)),
        top: Math.round(Number(rectY)),
        right: Math.round(Number(rectX) + Number(rectWidth)),
        bottom: Math.round(Number(rectY) + Number(rectHeight)),
        width: Math.round(Number(rectWidth)),
        height: Math.round(Number(rectHeight)),
    }
}

function parseNumber(value?: string): number | undefined {
    if (value === undefined) {
        return undefined
    }

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

function shouldPrintNode(node: NormalizedA11yNode, depth: number): boolean {
    if (!node.visible) {
        return false
    }

    if (node.role === 'AppiumAUT') {
        return false
    }

    if (node.role === 'Application') {
        return true
    }

    if (node.role === 'Window') {
        return depth <= 1
    }

    if (node.role === 'Other') {
        if (node.children.length > 0 && isTechnicalIdentifier(node.name)) {
            return false
        }

        if (node.text && !isLikelyAggregateText(node.text)) {
            return true
        }

        if (node.children.length === 0 && hasUsefulIdentity(node)) {
            return true
        }

        return node.hittable && hasUsefulIdentity(node)
    }

    if (node.text && !isLikelyAggregateText(node.text)) {
        return true
    }

    if (INTERACTIVE_ROLES.has(node.role)) {
        return true
    }

    return node.children.length === 0 && hasUsefulIdentity(node)
}

function formatNode(node: NormalizedA11yNode): string {
    const parts = [node.role]

    if (node.text) {
        parts.push(`"${escapeQuotes(node.text)}"`)
    }

    if (
        node.name &&
        node.name !== node.text &&
        !isLikelyAggregateText(node.name)
    ) {
        parts.push(`[id="${escapeQuotes(node.name)}"]`)
    }

    if (
        node.value &&
        node.value !== node.text &&
        node.value !== node.name &&
        !isLikelyAggregateText(node.value)
    ) {
        parts.push(`[value="${escapeQuotes(node.value)}"]`)
    }

    if (!node.enabled) {
        parts.push('[disabled]')
    }

    if (!node.hittable) {
        parts.push('[not-hittable]')
    }

    if (node.bounds) {
        parts.push(
            `(${node.bounds.left},${node.bounds.top},${node.bounds.right},${node.bounds.bottom})`,
        )
    }

    return parts.join(' ')
}

function escapeQuotes(value: string): string {
    return value.replace(/"/g, '\\"')
}

function compactNodes(nodes: NormalizedA11yNode[]): NormalizedA11yNode[] {
    return nodes.flatMap(compactNode)
}

function compactNode(node: NormalizedA11yNode): NormalizedA11yNode[] {
    const children = compactNodes(node.children)
    const compacted = {
        ...node,
        children: removeDuplicateMirroredChildren({ ...node, children })
            .children,
    }

    if (compacted.role === 'AppiumAUT') {
        return compacted.children
    }

    if (shouldDropNode(compacted)) {
        return []
    }

    return [compacted]
}

function compareNodesForTapTarget(
    left: NormalizedA11yNode,
    right: NormalizedA11yNode,
): number {
    if (left.hittable !== right.hittable) {
        return left.hittable ? -1 : 1
    }

    const leftTop = left.bounds?.top ?? Number.MAX_SAFE_INTEGER
    const rightTop = right.bounds?.top ?? Number.MAX_SAFE_INTEGER
    if (leftTop !== rightTop) {
        return leftTop - rightTop
    }

    const leftLeft = left.bounds?.left ?? Number.MAX_SAFE_INTEGER
    const rightLeft = right.bounds?.left ?? Number.MAX_SAFE_INTEGER
    return leftLeft - rightLeft
}

function selectDisplayText(
    role: string,
    values: Pick<NormalizedA11yNode, 'label' | 'name' | 'value'>,
    children: NormalizedA11yNode[],
): string | undefined {
    const candidates = [values.label, values.value, values.name].filter(
        Boolean,
    ) as string[]

    if (candidates.length === 0) {
        return undefined
    }

    const directText = candidates[0]

    if (role === 'Other' && children.length > 0) {
        if (isLikelyAggregateText(directText)) {
            return undefined
        }

        const childTexts = new Set(
            children
                .flatMap(child => [
                    child.text,
                    child.label,
                    child.name,
                    child.value,
                ])
                .filter(Boolean)
                .map(value => value as string),
        )

        if (childTexts.has(directText)) {
            return undefined
        }
    }

    return directText
}

function hasUsefulIdentity(node: NormalizedA11yNode): boolean {
    return [node.name, node.label, node.value].some(
        value => Boolean(value) && !isLikelyAggregateText(value),
    )
}

function removeDuplicateMirroredChildren(
    node: NormalizedA11yNode,
): NormalizedA11yNode {
    return {
        ...node,
        children: node.children.filter(child => !isMirroredChild(node, child)),
    }
}

function isMirroredChild(
    parent: NormalizedA11yNode,
    child: NormalizedA11yNode,
): boolean {
    if (parent.role !== child.role) {
        return false
    }

    if (parent.text !== child.text) {
        return false
    }

    if (!sameBounds(parent.bounds, child.bounds)) {
        return false
    }

    return child.children.length === 0
}

function sameBounds(left?: Bounds, right?: Bounds): boolean {
    if (!left || !right) {
        return false
    }

    return (
        left.left === right.left &&
        left.top === right.top &&
        left.right === right.right &&
        left.bottom === right.bottom
    )
}

function shouldDropNode(node: NormalizedA11yNode): boolean {
    if (isScrollBarNode(node)) {
        return true
    }

    return false
}

function isScrollBarNode(node: NormalizedA11yNode): boolean {
    const rawText = [node.text, node.label, node.name, node.value]
        .filter(Boolean)
        .join(' ')

    if (node.role !== 'Other' || !node.bounds) {
        return false
    }

    const mentionsScrollBar =
        rawText.includes('Vertical scroll bar') ||
        rawText.includes('Horizontal scroll bar')
    const isThin = node.bounds.width <= 40 || node.bounds.height <= 40

    if (mentionsScrollBar && isThin) {
        return true
    }

    return node.value === '0%' && isThin
}

function isTechnicalIdentifier(value?: string): boolean {
    if (!value) {
        return false
    }

    return (
        value.includes('_') ||
        value.endsWith('Container') ||
        value.endsWith('Wrapper')
    )
}

function isLikelyAggregateText(text?: string): boolean {
    if (!text) {
        return false
    }

    const wordCount = text.trim().split(/\s+/).length
    if (wordCount >= 8) {
        return true
    }

    return (
        text.includes('Vertical scroll bar') ||
        text.includes('Horizontal scroll bar') ||
        text.includes(', tab,') ||
        text.includes('page')
    )
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&#10;/g, '\n')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
}
