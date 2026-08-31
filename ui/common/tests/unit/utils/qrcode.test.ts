import { create } from 'qrcode'

import { renderStyledQrSvg } from '../../../utils/qrcode'

const moduleCount = (data: string) => create(data).modules.size

const shapeOf = (svg: string) => {
    if (
        svg.includes('stroke-width="90"') &&
        svg.includes('stroke-linecap="round"')
    )
        return 'dot'
    if (
        svg.includes('stroke-width="100"') &&
        svg.includes('stroke-linecap="butt"')
    )
        return 'square'
    return 'unknown'
}

const sparse = 'a'.repeat(181)
const dense = 'a'.repeat(214)

describe('renderStyledQrSvg', () => {
    it('straddles the density fallback with these payloads', () => {
        expect(moduleCount(sparse)).toBe(57)
        expect(moduleCount(dense)).toBe(61)
    })

    describe('when the caller states a module shape', () => {
        it('keeps dots on a dense code', () => {
            expect(
                shapeOf(renderStyledQrSvg(dense, { moduleShape: 'dot' })),
            ).toBe('dot')
        })

        it('keeps dots on a sparse code', () => {
            expect(
                shapeOf(renderStyledQrSvg(sparse, { moduleShape: 'dot' })),
            ).toBe('dot')
        })

        it('keeps squares on a sparse code', () => {
            expect(
                shapeOf(renderStyledQrSvg(sparse, { moduleShape: 'square' })),
            ).toBe('square')
        })
    })

    describe('when the caller states no module shape', () => {
        it('falls back to dots on a sparse code', () => {
            expect(shapeOf(renderStyledQrSvg(sparse))).toBe('dot')
        })

        it('falls back to squares on a dense code', () => {
            expect(shapeOf(renderStyledQrSvg(dense))).toBe('square')
        })
    })
})
