import { act, waitFor } from '@testing-library/react'

import { useWalletServiceMetadata } from '../../../hooks/fa'
import {
    selectWalletServiceMetadataHolds,
    setFaStatus,
    setupStore,
} from '../../../redux'
import { createMockFederationPreview } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithBridge } from '../../utils/render'

const INVITE = 'fed11invite'
const AUTOJOIN_KEY = 'fedi:autojoin_communities'

const makeStore = () => {
    const store = setupStore()
    store.dispatch(
        setFaStatus({
            type: 'restored',
            formation: {
                snapshotGeneration: 1,
                formationId: 'formation-1',
                federationInvite: INVITE,
                federationName: 'Morpheus',
                seats: [],
                phase: 'formed',
                freshness: 'fresh',
                backupEligible: false,
            },
        }),
    )
    return store
}

/** Each read answers with the next published value; the last one repeats. */
const makeBridge = (published: Array<string | undefined>) => {
    let reads = 0
    return createMockFedimintBridge({
        federationPreview: async () => {
            const value = published[Math.min(reads, published.length - 1)]
            reads += 1
            return createMockFederationPreview({
                meta: value === undefined ? {} : { [AUTOJOIN_KEY]: value },
            })
        },
    })
}

const renderWithPublished = (published: Array<string | undefined>) => {
    const store = makeStore()
    const fedimint = makeBridge(published)
    const rendered = renderHookWithBridge(
        () => useWalletServiceMetadata(),
        store,
        fedimint,
    )
    return { ...rendered, fedimint }
}

describe('common/hooks/fa useWalletServiceMetadata › autojoinSpaces', () => {
    it('should read the spaces from the published preview meta', async () => {
        const { result, fedimint } = renderWithPublished([
            '["fedi:community1a","fedi:community1b"]',
        ])

        await waitFor(() =>
            expect(result.current.autojoinSpaces).toEqual([
                'fedi:community1a',
                'fedi:community1b',
            ]),
        )
        expect(fedimint.federationPreview).toHaveBeenCalledWith(INVITE)
    })

    it('should give one lowercased entry per space', async () => {
        const { result } = renderWithPublished([
            '["fedi:community1a"," FEDI:COMMUNITY1A","fedi:community1b"]',
        ])

        await waitFor(() =>
            expect(result.current.autojoinSpaces).toEqual([
                'fedi:community1a',
                'fedi:community1b',
            ]),
        )
    })

    it('should give no spaces when nothing is published', async () => {
        const { result, fedimint } = renderWithPublished([undefined])

        await waitFor(() =>
            expect(fedimint.federationPreview).toHaveBeenCalledTimes(1),
        )
        expect(result.current.autojoinSpaces).toEqual([])
    })

    it.each([
        ['text that is not JSON', 'fedi:community1a'],
        ['JSON that is not a list', '{"code":"fedi:community1a"}'],
    ])('should give no spaces for %s', async (_label, value) => {
        const { result, fedimint } = renderWithPublished([value])

        await waitFor(() =>
            expect(fedimint.federationPreview).toHaveBeenCalledTimes(1),
        )
        expect(result.current.autojoinSpaces).toEqual([])
    })

    it('should drop entries that are not codes', async () => {
        const { result } = renderWithPublished(['["fedi:community1a",7]'])

        await waitFor(() =>
            expect(result.current.autojoinSpaces).toEqual(['fedi:community1a']),
        )
    })

    it('should show a just-saved empty list before consensus reports it', async () => {
        const { result } = renderWithPublished(['["fedi:community1a"]'])
        await waitFor(() =>
            expect(result.current.autojoinSpaces).toEqual(['fedi:community1a']),
        )

        act(() => result.current.markApplied({ autojoinCommunities: '[]' }))

        expect(result.current.autojoinSpaces).toEqual([])
    })

    // the hold is spent by comparing the published text with `===`; an
    // array held instead would never equal a freshly parsed one, and the
    // saved list would mask every later change made from another device
    it('should release the held list once consensus publishes the same text', async () => {
        const { result, fedimint } = renderWithPublished([
            '[]',
            '["fedi:community1a"]',
            '[]',
        ])
        await waitFor(() =>
            expect(fedimint.federationPreview).toHaveBeenCalledTimes(1),
        )
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        act(() =>
            result.current.markApplied({
                autojoinCommunities: '["fedi:community1a"]',
            }),
        )
        expect(result.current.autojoinSpaces).toEqual(['fedi:community1a'])

        await act(() => result.current.refresh())
        expect(result.current.autojoinSpaces).toEqual(['fedi:community1a'])

        await act(() => result.current.refresh())
        expect(result.current.autojoinSpaces).toEqual([])
    })
})

describe('common/hooks/fa useWalletServiceMetadata › shared holds', () => {
    const SPACE_A = 'fedi:community1a'
    const SPACE_B = 'fedi:community1b'
    const ONE = JSON.stringify([SPACE_A])
    const TWO = JSON.stringify([SPACE_A, SPACE_B])

    it('should show a hold made by one instance in another', async () => {
        const store = makeStore()
        const fedimint = makeBridge([ONE])
        const editor = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )
        const settings = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )
        await waitFor(() =>
            expect(settings.result.current.hasLoaded).toBe(true),
        )
        await waitFor(() => expect(editor.result.current.hasLoaded).toBe(true))

        act(() =>
            editor.result.current.markApplied({ autojoinCommunities: TWO }),
        )

        expect(settings.result.current.autojoinSpaces).toEqual([
            SPACE_A,
            SPACE_B,
        ])
    })

    it('should keep a hold after the instance that made it unmounts', async () => {
        const store = makeStore()
        // consensus still reports the old list on every read
        const fedimint = makeBridge([ONE])
        const editor = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )
        await waitFor(() => expect(editor.result.current.hasLoaded).toBe(true))
        act(() =>
            editor.result.current.markApplied({ autojoinCommunities: TWO }),
        )
        editor.unmount()

        const settings = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )
        await waitFor(() =>
            expect(settings.result.current.hasLoaded).toBe(true),
        )

        expect(fedimint.federationPreview).toHaveBeenCalledTimes(2)
        expect(settings.result.current.autojoinSpaces).toEqual([
            SPACE_A,
            SPACE_B,
        ])
    })

    it('should release the hold when another instance reads the held value', async () => {
        const store = makeStore()
        const fedimint = makeBridge([ONE, TWO])
        const editor = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )
        await waitFor(() => expect(editor.result.current.hasLoaded).toBe(true))
        act(() =>
            editor.result.current.markApplied({ autojoinCommunities: TWO }),
        )
        expect(selectWalletServiceMetadataHolds(store.getState())).toEqual({
            autojoinCommunities: TWO,
        })

        const settings = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )

        await waitFor(() =>
            expect(selectWalletServiceMetadataHolds(store.getState())).toEqual(
                {},
            ),
        )
        expect(settings.result.current.autojoinSpaces).toEqual([
            SPACE_A,
            SPACE_B,
        ])
    })
})

describe('common/hooks/fa useWalletServiceMetadata › one shared record', () => {
    const SPACE_A = 'fedi:community1a'
    const SPACE_B = 'fedi:community1b'
    const ONE = JSON.stringify([SPACE_A])
    const TWO = JSON.stringify([SPACE_A, SPACE_B])

    /** Every read waits until the test answers it, in any order. */
    const makeHeldBridge = () => {
        const reads: Array<(value: string) => void> = []
        const fedimint = createMockFedimintBridge({
            federationPreview: () =>
                new Promise(resolve =>
                    reads.push(value =>
                        resolve(
                            createMockFederationPreview({
                                meta: { [AUTOJOIN_KEY]: value },
                            }),
                        ),
                    ),
                ),
        })
        return { fedimint, reads }
    }

    it('should show the same values in two instances', async () => {
        const store = makeStore()
        const fedimint = makeBridge([ONE, TWO])
        const editor = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )
        const settings = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )

        await waitFor(() =>
            expect(fedimint.federationPreview).toHaveBeenCalledTimes(2),
        )
        await waitFor(() => expect(editor.result.current.isLoading).toBe(false))

        expect(editor.result.current.autojoinSpaces).toEqual([SPACE_A, SPACE_B])
        expect(settings.result.current.autojoinSpaces).toEqual([
            SPACE_A,
            SPACE_B,
        ])
    })

    it('should not show an older read in one instance after another releases the hold', async () => {
        const store = makeStore()
        const { fedimint, reads } = makeHeldBridge()
        const editor = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )
        const settings = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            store,
            fedimint,
        )
        await waitFor(() => expect(reads).toHaveLength(2))
        await act(async () => {
            reads[0](ONE)
            reads[1](ONE)
        })
        act(() =>
            editor.result.current.markApplied({ autojoinCommunities: TWO }),
        )

        // the settings read starts while consensus still has the old list,
        // and the editor's later read is the one that sees the save
        let settingsRead: Promise<void> = Promise.resolve()
        let editorRead: Promise<void> = Promise.resolve()
        act(() => {
            settingsRead = settings.result.current.refresh()
            editorRead = editor.result.current.refresh()
        })
        await act(async () => {
            reads[3](TWO)
            await editorRead
        })
        expect(selectWalletServiceMetadataHolds(store.getState())).toEqual({})
        await act(async () => {
            reads[2](ONE)
            await settingsRead
        })

        expect(settings.result.current.autojoinSpaces).toEqual([
            SPACE_A,
            SPACE_B,
        ])
        expect(editor.result.current.autojoinSpaces).toEqual([SPACE_A, SPACE_B])
    })
})

describe('common/hooks/fa useWalletServiceMetadata › hasLoaded', () => {
    it('should report not loaded until the first read resolves', async () => {
        let answer: (value: unknown) => void = () => undefined
        const fedimint = createMockFedimintBridge({
            federationPreview: () =>
                new Promise(resolve => {
                    answer = resolve
                }),
        })
        const { result } = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            makeStore(),
            fedimint,
        )
        await waitFor(() =>
            expect(fedimint.federationPreview).toHaveBeenCalledTimes(1),
        )
        expect(result.current.hasLoaded).toBe(false)

        await act(async () =>
            answer(
                createMockFederationPreview({
                    meta: { [AUTOJOIN_KEY]: '["fedi:community1a"]' },
                }),
            ),
        )

        expect(result.current.hasLoaded).toBe(true)
    })

    it('should report a failed first read and load on refresh', async () => {
        const fedimint = createMockFedimintBridge({
            federationPreview: jest
                .fn()
                .mockRejectedValueOnce(new Error('bridge down'))
                .mockResolvedValue(
                    createMockFederationPreview({
                        meta: { [AUTOJOIN_KEY]: '["fedi:community1a"]' },
                    }),
                ),
        })
        const { result } = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            makeStore(),
            fedimint,
        )
        await waitFor(() => expect(result.current.hasFailed).toBe(true))

        await act(() => result.current.refresh())

        expect(fedimint.federationPreview).toHaveBeenCalledTimes(2)
        expect(result.current.hasFailed).toBe(false)
        expect(result.current.hasLoaded).toBe(true)
        expect(result.current.autojoinSpaces).toEqual(['fedi:community1a'])
    })

    it('should stay not loaded after a failed first read', async () => {
        const fedimint = createMockFedimintBridge({
            federationPreview: () => Promise.reject(new Error('bridge down')),
        })
        const { result } = renderHookWithBridge(
            () => useWalletServiceMetadata(),
            makeStore(),
            fedimint,
        )

        await waitFor(() =>
            expect(fedimint.federationPreview).toHaveBeenCalledTimes(1),
        )
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        expect(result.current.hasLoaded).toBe(false)
    })
})
