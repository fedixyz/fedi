import type { SaveFileRequest, SaveFileResult } from '@fedi/common/types'
import '@fedi/injections/src/injectables/fediInternal'
import { InjectionMessageType } from '@fedi/injections/src/types'

const injectedWindow = window as typeof window & {
    fediInternal: {
        saveFile(request: SaveFileRequest): Promise<SaveFileResult>
    }
    ReactNativeWebView?: { postMessage: jest.Mock }
}

const request = {
    filename: 'export.json',
    mimeType: 'application/json',
    contents: '{}',
}

describe('fediInternal.saveFile', () => {
    afterEach(() => {
        delete injectedWindow.ReactNativeWebView
        jest.restoreAllMocks()
    })

    it('should reject without a native bridge instead of waiting for a response', async () => {
        const postMessage = jest.spyOn(window, 'postMessage')

        await expect(
            injectedWindow.fediInternal.saveFile(request),
        ).rejects.toThrow('SaveFileUnavailable')
        expect(postMessage).not.toHaveBeenCalled()
    })

    it.each(['saved', 'cancelled'] as const)(
        'should resolve the native %s response through the injected API',
        async result => {
            const postMessage = jest.fn()
            injectedWindow.ReactNativeWebView = { postMessage }

            const saving = injectedWindow.fediInternal.saveFile(request)
            const message = JSON.parse(postMessage.mock.calls[0][0])
            expect(message).toEqual({
                id: expect.any(Number),
                type: InjectionMessageType.fedi_saveFile,
                data: request,
            })
            window.dispatchEvent(
                new CustomEvent('fedi:message', {
                    detail: {
                        id: message.id,
                        type: message.type,
                        data: result,
                    },
                }),
            )

            await expect(saving).resolves.toBe(result)
        },
    )
})
