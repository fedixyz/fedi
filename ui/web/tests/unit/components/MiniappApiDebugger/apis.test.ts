import { InjectionMessageType } from '@fedi/injections/src/types'

import {
    apis,
    resolveData,
} from '../../../../src/components/MiniappApiDebugger/apis'

const saveFile = apis.find(
    api => api.type === InjectionMessageType.fedi_saveFile,
)

const variant = (label: string) => {
    const match = saveFile?.variants.find(item => item.label === label)
    if (!match) throw new Error(`missing save file variant: ${label}`)
    return match
}

describe('miniapp API debug catalog', () => {
    it('should offer a call for every injected miniapp API', () => {
        const covered = apis.map(api => api.type)

        expect([...covered].sort()).toEqual(
            [...Object.values(InjectionMessageType)].sort(),
        )
        expect(new Set(covered).size).toBe(covered.length)
    })

    it('should request a mini app seed with no payload', () => {
        const seed = apis.find(
            api => api.type === InjectionMessageType.fedi_getSeed,
        )

        expect(seed?.variants).toHaveLength(1)
        expect(resolveData(seed?.variants[0].data, {})).toBeUndefined()
    })

    it('should build a save-file request from the custom fields', () => {
        expect(
            resolveData(variant('Custom').data, {
                sf_name: 'badge.json',
                sf_mime: 'application/json',
                sf_body: '{"ok":true}',
            }),
        ).toEqual({
            filename: 'badge.json',
            mimeType: 'application/json',
            contents: '{"ok":true}',
        })
    })

    it('should fall back to a saveable sample when the custom fields are blank', () => {
        expect(resolveData(variant('Custom').data, {})).toEqual({
            filename: 'export.json',
            mimeType: 'application/json',
            contents: '{"hello":"world"}',
        })
    })

    it('should include save-file calls the app rejects before the picker', () => {
        expect(resolveData(variant('Empty (rejects)').data, {})).toEqual({
            filename: 'empty.txt',
            mimeType: 'text/plain',
            contents: '',
        })
        expect(resolveData(variant('Bad name (rejects)').data, {})).toEqual({
            filename: '../secret.txt',
            mimeType: 'text/plain',
            contents: 'nope',
        })
    })
})
