/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path')

const stripExt = f => path.basename(f, path.extname(f))

module.exports = function autoTestId({ types: t }) {
    // Build-time analog of isDev() from ui/common/utils/environment.ts.
    // Runtime isDev() = (__DEV__ === true) || (NODE_ENV === 'development').
    // At build time __DEV__ doesn't exist yet and this Metro version doesn't
    // expose `dev` on the Babel caller, so we approximate by treating anything
    // not explicitly marked production as dev. Release builds (Gradle
    // bundleRelease, Xcode release scheme) set NODE_ENV=production, so the
    // production path is still safe.
    const env = process.env.NODE_ENV
    const babelEnv = process.env.BABEL_ENV
    const isDev = env !== 'production' && babelEnv !== 'production'

    const hasTestIdOrSpread = openingEl =>
        openingEl.attributes.some(
            a =>
                t.isJSXSpreadAttribute(a) ||
                (t.isJSXAttribute(a) &&
                    t.isJSXIdentifier(a.name, { name: 'testID' })),
        )

    const elementName = openingEl => {
        const n = openingEl.name
        if (t.isJSXIdentifier(n)) return n.name
        if (t.isJSXMemberExpression(n)) return n.property.name
        return null
    }

    const nearestOwnerName = jsxPath => {
        let p = jsxPath.parentPath
        while (p) {
            if (p.isVariableDeclarator() && t.isIdentifier(p.node.id))
                return p.node.id.name
            if (
                (p.isFunctionDeclaration() || p.isClassDeclaration()) &&
                p.node.id
            )
                return p.node.id.name
            if (p.isFunctionExpression() && p.node.id) return p.node.id.name
            p = p.parentPath
        }
        return null
    }

    return {
        name: 'auto-testid',
        visitor: {
            Program: {
                enter(_p, state) {
                    state.counters = new Map()
                    const fn = state.filename || ''
                    const isAppCode =
                        !fn.includes('/node_modules/') &&
                        (fn.includes('/ui/native/') ||
                            fn.includes('/ui/common/'))
                    state.shouldInstrument = isDev && isAppCode
                },
            },
            JSXOpeningElement(jsxPath, state) {
                if (!state.shouldInstrument) return
                if (hasTestIdOrSpread(jsxPath.node)) return

                const elName = elementName(jsxPath.node)
                if (!elName || elName === 'Fragment') return

                const fileSeg = state.filename
                    ? stripExt(state.filename)
                    : 'Unknown'
                const ownerSeg = nearestOwnerName(jsxPath) || '_'
                const key = `${fileSeg}__${ownerSeg}__${elName}`
                const idx = state.counters.get(key) ?? 0
                state.counters.set(key, idx + 1)

                jsxPath.node.attributes.push(
                    t.jsxAttribute(
                        t.jsxIdentifier('testID'),
                        t.stringLiteral(
                            `${fileSeg}.${ownerSeg}.${elName}.${idx}`,
                        ),
                    ),
                )
            },
        },
    }
}
