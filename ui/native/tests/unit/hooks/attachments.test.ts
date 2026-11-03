import { act, cleanupAsync } from '@testing-library/react-native'

import { useMessageAttachments } from '../../../utils/hooks/attachments'
import { renderHookWithProviders } from '../../utils/render'

const mockPickMedia = jest.fn()
const mockPickDocuments = jest.fn()

jest.mock('../../../utils/hooks/media', () => ({
    useMediaPicker: () => ({ pickMedia: mockPickMedia, isLoading: false }),
    useDocumentPicker: () => ({
        pickDocuments: mockPickDocuments,
        isLoading: false,
        pending: [],
    }),
}))

describe('useMessageAttachments', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        const asset = (name: string) => ({
            uri: `file:///${name}.png`,
            fileName: `${name}.png`,
            type: 'image/png',
            width: 1,
            height: 1,
        })
        const document = (name: string) => ({
            uri: `file:///${name}.txt`,
            name: `${name}.txt`,
            type: 'text/plain',
        })
        mockPickMedia.mockResolvedValue([
            asset('duplicate'),
            asset('duplicate'),
            asset('remaining'),
        ])
        mockPickDocuments.mockResolvedValue([
            document('duplicate'),
            document('duplicate'),
            document('remaining'),
        ])
    })

    afterEach(async () => {
        await cleanupAsync()
    })

    it('does not remove another selection when an uploading image is removed', async () => {
        const { result } = renderHookWithProviders(useMessageAttachments)
        await act(async () => {
            await result.current.handlePickMedia()
        })
        const submitted = result.current
        const [accepted, duplicate, remaining] = submitted.matrixAttachments

        act(() => {
            result.current.removeMedia(submitted.media[0])
        })
        expect(result.current.matrixAttachments).toEqual([duplicate, remaining])

        act(() => {
            submitted.removeSentAttachment(accepted)
        })
        expect(result.current.matrixAttachments).toEqual([duplicate, remaining])
    })

    it.each(['media', 'documents'])(
        'removes one accepted %s selection at a time when URIs repeat',
        async kind => {
            const { result } = renderHookWithProviders(useMessageAttachments)
            await act(async () => {
                if (kind === 'media') await result.current.handlePickMedia()
                else await result.current.handlePickDocuments()
            })

            const submitted = result.current
            const [accepted, duplicate, remaining] = submitted.matrixAttachments
            expect(accepted.uri).toBe(duplicate.uri)
            expect(accepted.uri).not.toBe(remaining.uri)

            await act(async () => {
                submitted.removeSentAttachment(accepted)
            })
            expect(result.current.matrixAttachments).toEqual([
                duplicate,
                remaining,
            ])

            await act(async () => {
                submitted.removeSentAttachment(duplicate)
                submitted.removeSentAttachment(duplicate)
            })
            expect(result.current.matrixAttachments).toEqual([remaining])
            expect(result.current.hasAttachments).toBe(true)

            await act(async () => {
                submitted.removeSentAttachment(remaining)
            })
            expect(result.current.matrixAttachments).toEqual([])
            expect(result.current.hasAttachments).toBe(false)
        },
    )
})
