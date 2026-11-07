import {
    findNodeByExactText,
    formatNormalizedA11yTree,
    getTapPoint,
    normalizeAppiumPageSource,
} from '../../../scripts/steve/a11y'

const samplePageSource = `<?xml version="1.0" encoding="UTF-8"?>
<XCUIElementTypeApplication type="XCUIElementTypeApplication" name="Fedi" label="Fedi" visible="true" enabled="true" x="0" y="0" width="393" height="852">
  <XCUIElementTypeWindow type="XCUIElementTypeWindow" visible="true" enabled="true" x="0" y="0" width="393" height="852">
    <XCUIElementTypeOther type="XCUIElementTypeOther" visible="true" enabled="true" x="0" y="0" width="393" height="852">
      <XCUIElementTypeStaticText type="XCUIElementTypeStaticText" name="Welcome" label="Welcome" value="Welcome" visible="true" enabled="true" x="24" y="96" width="120" height="22" />
      <XCUIElementTypeButton type="XCUIElementTypeButton" name="ContinueButton" label="Continue" visible="true" enabled="true" hittable="true" x="24" y="760" width="345" height="50" />
    </XCUIElementTypeOther>
  </XCUIElementTypeWindow>
</XCUIElementTypeApplication>`

describe('steve accessibility normalization', () => {
    it('formats Appium XML into a readable tree', () => {
        const tree = normalizeAppiumPageSource(samplePageSource)
        const formatted = formatNormalizedA11yTree(tree)

        expect(formatted).toContain('Application "Fedi" (0,0,393,852)')
        expect(formatted).toContain('StaticText "Welcome" (24,96,144,118)')
        expect(formatted).toContain(
            'Button "Continue" [id="ContinueButton"] (24,760,369,810)',
        )
        expect(formatted).not.toContain('XCUIElementTypeButton')
    })

    it('finds exact text matches and returns tap coordinates', () => {
        const tree = normalizeAppiumPageSource(samplePageSource)
        const node = findNodeByExactText(tree, 'Continue')

        expect(node?.role).toBe('Button')
        expect(node).toBeDefined()
        if (!node) {
            throw new Error('Expected to find Continue node')
        }
        expect(getTapPoint(node)).toEqual({ x: 197, y: 785 })
    })

    describe('with a container XCUITest reports as not visible', () => {
        // Shape of the iOS 26 Settings page source: the CollectionView is not
        // visible, its cells and their contents are.
        const settingsPageSource = `<?xml version="1.0" encoding="UTF-8"?>
<XCUIElementTypeApplication type="XCUIElementTypeApplication" name="Settings" label="Settings" visible="true" enabled="true" x="0" y="0" width="393" height="852">
  <XCUIElementTypeCollectionView type="XCUIElementTypeCollectionView" visible="false" enabled="true" x="0" y="0" width="393" height="852">
    <XCUIElementTypeCell type="XCUIElementTypeCell" visible="true" enabled="true" x="16" y="377" width="361" height="53">
      <XCUIElementTypeButton type="XCUIElementTypeButton" name="com.apple.settings.general" label="General" visible="true" enabled="true" x="16" y="377" width="361" height="53">
        <XCUIElementTypeStaticText type="XCUIElementTypeStaticText" name="General" label="General" value="General" visible="true" enabled="true" x="29" y="389" width="103" height="29" />
      </XCUIElementTypeButton>
    </XCUIElementTypeCell>
    <XCUIElementTypeButton type="XCUIElementTypeButton" name="Offscreen" label="Offscreen" visible="false" enabled="true" x="16" y="900" width="361" height="53" />
  </XCUIElementTypeCollectionView>
</XCUIElementTypeApplication>`

        it('finds every node that a11y prints', () => {
            const tree = normalizeAppiumPageSource(settingsPageSource)

            expect(formatNormalizedA11yTree(tree)).toContain('Button "General"')
            const node = findNodeByExactText(tree, 'General')
            expect(node?.role).toBe('Button')
            if (!node) {
                throw new Error('Expected to find General node')
            }
            expect(getTapPoint(node)).toEqual({ x: 197, y: 404 })
        })

        it('does not match a node that is itself not visible', () => {
            const tree = normalizeAppiumPageSource(settingsPageSource)

            expect(findNodeByExactText(tree, 'Offscreen')).toBeUndefined()
        })
    })
})
