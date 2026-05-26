// Registered only in dev (see babel.config.js). Injects a source-location
// testID on app-code JSX elements that don't already have one.
module.exports = function autoTestId({ types: t }) {
    const hasTestIdOrSpread = openingEl =>
        openingEl.attributes.some(
            a =>
                t.isJSXSpreadAttribute(a) ||
                (t.isJSXAttribute(a) &&
                    t.isJSXIdentifier(a.name, { name: 'testID' })),
        )

    const isFragment = openingEl => {
        const n = openingEl.name
        return (
            t.isJSXIdentifier(n, { name: 'Fragment' }) ||
            (t.isJSXMemberExpression(n) &&
                t.isJSXIdentifier(n.property, { name: 'Fragment' }))
        )
    }

    return {
        name: 'auto-testid',
        visitor: {
            Program: {
                enter(_p, state) {
                    const fn = state.filename || ''
                    state.isAppCode =
                        !fn.includes('/node_modules/') &&
                        (fn.includes('/ui/native/') ||
                            fn.includes('/ui/common/'))
                    // keep the path from ui/ onward, e.g. ui/native/.../Foo.tsx
                    const i = fn.indexOf('/ui/')
                    state.fileSeg = i >= 0 ? fn.slice(i + 1) : fn
                },
            },
            JSXOpeningElement(jsxPath, state) {
                if (!state.isAppCode) return
                if (hasTestIdOrSpread(jsxPath.node)) return
                if (isFragment(jsxPath.node)) return

                const loc = jsxPath.node.loc
                if (!loc) return

                // file:line:col, the source location React's dev tooling
                // already derives from __source, surfaced into the native tree
                jsxPath.node.attributes.push(
                    t.jsxAttribute(
                        t.jsxIdentifier('testID'),
                        t.stringLiteral(
                            `${state.fileSeg}:${loc.start.line}:${loc.start.column + 1}`,
                        ),
                    ),
                )
            },
        },
    }
}
