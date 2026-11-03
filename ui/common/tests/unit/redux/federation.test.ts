import i18n from 'i18next'

import {
    autojoinCommunity,
    checkFederationForAutojoinCommunities,
    clearAutojoinedCommunitiesAndNotices,
    initializeCommonStore,
    joinCommunity,
    joinFederation,
    leaveCommunity,
    refreshFederations,
    refreshGuardianStatuses,
    removeFederations,
    selectFederations,
    selectRecentlyUsedFederationIds,
    setFederations,
    setLastUsedFederationId,
    setPayFromFederationId,
    setupStore,
    selectLoadedFederation,
    updateFederationBalance,
    setIsInternetUnreachable,
    setCommunities,
    setLastSelectedCommunityId,
    setPreviouslyAutojoinedCommunity,
    preloadFederationLists,
    selectPublicFederations,
    setOnboardingCompleted,
} from '../../../redux'
import { FederationMetadata, MSats } from '../../../types'
import {
    GuardianStatus,
    RpcFederation,
    RpcFederationMaybeLoading,
    RpcFederationPreview,
} from '../../../types/bindings'
import {
    mockCommunity,
    mockFederation1,
    mockFederation2,
} from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { mockStorageApi } from '../../utils/render'

const mockFederation3 = { ...mockFederation1, id: '3' }

describe('common/redux/federation guardian refresh', () => {
    const reachable: GuardianStatus[] = [
        {
            online: {
                guardian: 'wss://guardian.example',
                mg_name: null,
                latency_ms: 10,
            },
        },
    ]

    it('should preserve balance updates received during a health check', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        let complete!: (statuses: GuardianStatus[]) => void
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: () =>
                new Promise<GuardianStatus[]>(resolve => {
                    complete = resolve
                }),
        })
        const pending = store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        store.dispatch(
            updateFederationBalance({
                federationId: mockFederation1.id,
                balance: 123456 as MSats,
            }),
        )
        complete(reachable)
        await pending.unwrap()
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)
                ?.balance,
        ).toBe(123456)
    })

    it('should not restore a federation removed during a health check', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        let complete!: (statuses: GuardianStatus[]) => void
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: () =>
                new Promise<GuardianStatus[]>(resolve => {
                    complete = resolve
                }),
        })
        const pending = store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        store.dispatch(removeFederations([mockFederation1.id]))
        complete(reachable)
        await pending.unwrap()
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id),
        ).toBeUndefined()
    })

    it('should disregard probe failures collected after the phone loses internet', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        let complete!: (statuses: GuardianStatus[]) => void
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: () =>
                new Promise<GuardianStatus[]>(resolve => {
                    complete = resolve
                }),
        })
        const pending = store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        store.dispatch(setIsInternetUnreachable(true))
        complete([
            {
                timeout: {
                    guardian: 'wss://guardian.example',
                    mg_name: null,
                    elapsed: '10s',
                },
            },
        ])
        await pending.unwrap()
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)
                ?.status,
        ).toBe('unknown')
    })
})

describe('common/redux/federation › removeFederations', () => {
    it('should prune a removed federation from recentlyUsedFederationIds and move payFromFederationId off it', () => {
        const store = setupStore()
        store.dispatch(
            setFederations([mockFederation1, mockFederation2, mockFederation3]),
        )
        store.dispatch(setLastUsedFederationId(mockFederation1.id))
        store.dispatch(setLastUsedFederationId(mockFederation2.id))
        store.dispatch(setPayFromFederationId(mockFederation2.id))

        store.dispatch(removeFederations([mockFederation2.id]))

        expect(selectRecentlyUsedFederationIds(store.getState())).not.toContain(
            mockFederation2.id,
        )
        expect(store.getState().federation.payFromFederationId).not.toBe(
            mockFederation2.id,
        )
    })

    it('should set payFromFederationId to null when the last federation is removed', () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))

        store.dispatch(removeFederations([mockFederation1.id]))

        expect(store.getState().federation.payFromFederationId).toBeNull()
    })

    it('should be a no-op for an id that is not joined', () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1, mockFederation2]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))

        store.dispatch(removeFederations(['unknown-id']))

        expect(selectFederations(store.getState()).map(f => f.id)).toEqual([
            mockFederation1.id,
            mockFederation2.id,
        ])
        expect(store.getState().federation.payFromFederationId).toBe(
            mockFederation1.id,
        )
    })

    it('should leave federations not named in the payload untouched', () => {
        const store = setupStore()
        store.dispatch(
            setFederations([mockFederation1, mockFederation2, mockFederation3]),
        )

        store.dispatch(removeFederations([mockFederation2.id]))

        expect(selectFederations(store.getState()).map(f => f.id)).toEqual([
            mockFederation1.id,
            mockFederation3.id,
        ])
    })
})

describe('common/redux/federation › bridge meta updates', () => {
    let cleanup: (() => void) | undefined
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
    })
    afterEach(async () => {
        await jest.advanceTimersByTimeAsync(0)
        cleanup?.()
        cleanup = undefined
        jest.useRealTimers()
    })

    const linkedCommunity = {
        ...mockCommunity,
        id: 'linked-community',
        communityInvite: {
            ...mockCommunity.communityInvite,
            invite_code_str: 'linked-community',
        },
    }

    const setup = () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: [],
            listFederations: [mockFederation1],
            joinFederation: mockFederation2,
            joinCommunity: linkedCommunity,
            leaveCommunity: undefined,
            listCommunities: [linkedCommunity],
        })
        let emit!: (event: RpcFederationMaybeLoading) => void
        fedimint.addListener.mockImplementation(((
            type: string,
            listener: typeof emit,
        ) => {
            if (type === 'federation') emit = listener
            return () => {}
        }) as typeof fedimint.addListener)
        cleanup = initializeCommonStore({
            store,
            fedimint,
            storage: mockStorageApi,
            i18n,
        })
        return { store, fedimint, emit }
    }
    const metaUpdate = (
        id: string,
        meta: FederationMetadata,
    ): RpcFederationMaybeLoading => ({ ...mockFederation1, id, meta })

    it('should show the new name and join newly linked communities once for existing members', async () => {
        const { store, fedimint, emit } = setup()
        const update = metaUpdate(mockFederation1.id, {
            federation_name: 'Renamed',
            'fedi:autojoin_communities': '["linked-community"]',
        })
        emit(update)
        emit(update)
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)?.name,
        ).toBe('Renamed')
        await jest.advanceTimersByTimeAsync(0)
        expect(
            store.getState().federation.previouslyAutojoinedCommunities,
        ).toHaveProperty(['linked-community'])
        emit(update)
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(1)
        expect(fedimint.joinCommunity).toHaveBeenCalledWith({
            inviteCode: 'linked-community',
        })
        expect(fedimint.listFederations).not.toHaveBeenCalled()
        expect(fedimint.listCommunities).toHaveBeenCalledTimes(1)
    })

    it('should preserve the current community and show a notice for a background autojoin', async () => {
        const { store, emit } = setup()
        store.dispatch(setLastSelectedCommunityId('current-community'))
        emit(
            metaUpdate(mockFederation1.id, {
                'fedi:autojoin_communities': '["linked-community"]',
            }),
        )
        await jest.advanceTimersByTimeAsync(0)
        expect(store.getState().federation.lastSelectedCommunityId).toBe(
            'current-community',
        )
        expect(store.getState().federation.autojoinNoticesToDisplay).toEqual([
            linkedCommunity.id,
        ])
    })

    it('should retry an unsuccessful background autojoin on a later metadata event', async () => {
        const { store, fedimint, emit } = setup()
        fedimint.joinCommunity.mockRejectedValueOnce(new Error('offline'))
        const update = metaUpdate(mockFederation1.id, {
            'fedi:autojoin_communities': '["linked-community"]',
        })
        emit(update)
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(1)
        expect(
            store.getState().federation.previouslyAutojoinedCommunities,
        ).toEqual({})
        emit(update)
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(2)
        expect(
            store.getState().federation.previouslyAutojoinedCommunities,
        ).toHaveProperty(['linked-community'])
    })

    it('should respect a member who left an autojoined community', async () => {
        const { store, fedimint, emit } = setup()
        store.dispatch(setCommunities([linkedCommunity]))
        store.dispatch(
            setPreviouslyAutojoinedCommunity({
                communityId: linkedCommunity.id,
            }),
        )
        await store
            .dispatch(
                leaveCommunity({ fedimint, communityId: linkedCommunity.id }),
            )
            .unwrap()
        emit(
            metaUpdate(mockFederation1.id, {
                'fedi:autojoin_communities': '["linked-community"]',
            }),
        )
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.joinCommunity).not.toHaveBeenCalled()
        expect(store.getState().federation.communities).toEqual([])
    })

    it.each([
        { federation_name: 'Renamed' },
        { 'fedi:federation_name': 'Renamed', federation_name: 'Original' },
    ])(
        'should retain the name from metadata %j after a list refresh',
        async meta => {
            const { store, fedimint, emit } = setup()
            const update = metaUpdate(mockFederation1.id, meta)
            fedimint.listFederations = jest.fn().mockResolvedValue([update])
            emit(update)
            expect(
                selectLoadedFederation(store.getState(), mockFederation1.id)
                    ?.name,
            ).toBe('Renamed')
            await store.dispatch(refreshFederations(fedimint)).unwrap()
            expect(
                selectLoadedFederation(store.getState(), mockFederation1.id)
                    ?.name,
            ).toBe('Renamed')
            expect(fedimint.joinCommunity).not.toHaveBeenCalled()
        },
    )

    it('should resume background autojoins after a failed federation join', async () => {
        const { store, fedimint, emit } = setup()
        fedimint.joinFederation.mockRejectedValueOnce(new Error('offline'))
        await expect(
            store
                .dispatch(joinFederation({ fedimint, code: 'fed1failed' }))
                .unwrap(),
        ).rejects.toMatchObject({ message: 'offline' })
        emit(
            metaUpdate(mockFederation1.id, {
                'fedi:autojoin_communities': '["linked-community"]',
            }),
        )
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(1)
        expect(store.getState().federation.autojoinNoticesToDisplay).toEqual([
            linkedCommunity.id,
        ])
    })

    it('should retain community membership when a link is removed', async () => {
        const { store, fedimint, emit } = setup()
        store.dispatch(setCommunities([linkedCommunity]))
        emit(
            metaUpdate(mockFederation1.id, {
                'fedi:autojoin_communities': '[]',
            }),
        )
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.leaveCommunity).not.toHaveBeenCalled()
        expect(store.getState().federation.communities).toEqual([
            linkedCommunity,
        ])
    })

    it('should leave repeated ready events during a new join to the explicit join flow', async () => {
        const { store, fedimint, emit } = setup()
        let completeJoin!: (federation: RpcFederation) => void
        fedimint.joinFederation.mockImplementation(
            () =>
                new Promise(resolve => {
                    completeJoin = resolve
                }),
        )
        const pending = store.dispatch(
            joinFederation({ fedimint, code: 'fed1new' }),
        )
        const update = metaUpdate(mockFederation2.id, {
            'fedi:autojoin_communities': '["linked-community"]',
        })
        emit(update)
        emit(update)
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.joinCommunity).not.toHaveBeenCalled()
        completeJoin({ ...mockFederation1, id: mockFederation2.id })
        const joined = await pending.unwrap()
        await store
            .dispatch(
                checkFederationForAutojoinCommunities({
                    fedimint,
                    federation: joined,
                    setAsSelected: true,
                }),
            )
            .unwrap()
        expect(store.getState().federation.lastSelectedCommunityId).toBe(
            linkedCommunity.id,
        )
        expect(store.getState().federation.autojoinNoticesToDisplay).toEqual([])
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(1)
    })

    it('should leave autojoin for a federation being joined to the join flow', async () => {
        const { fedimint, emit } = setup()
        emit(
            metaUpdate('new-federation', {
                'fedi:autojoin_communities': '["joining-community"]',
            }),
        )
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.joinCommunity).not.toHaveBeenCalled()
    })
})

describe('common/redux/federation › autojoinCommunity', () => {
    beforeEach(() => jest.clearAllMocks())

    const setup = () => ({
        store: setupStore(),
        fedimint: createMockFedimintBridge({
            joinCommunity: mockCommunity,
            listCommunities: [mockCommunity],
        }),
    })

    it('should retry after a temporary failure', async () => {
        const { store, fedimint } = setup()
        fedimint.joinCommunity.mockRejectedValueOnce(new Error('offline'))
        const args = { fedimint, code: 'retry-community' }
        await store.dispatch(autojoinCommunity(args)).unwrap()
        expect(
            store.getState().federation.previouslyAutojoinedCommunities,
        ).toEqual({})
        await store.dispatch(autojoinCommunity(args)).unwrap()
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(2)
        expect(
            store.getState().federation.previouslyAutojoinedCommunities,
        ).toHaveProperty([args.code])
    })

    it('should isolate concurrent autojoins in separate stores', async () => {
        const first = setup()
        const second = setup()
        await Promise.all(
            [first, second].map(({ store, fedimint }) =>
                store
                    .dispatch(
                        autojoinCommunity({
                            fedimint,
                            code: 'independent-community',
                        }),
                    )
                    .unwrap(),
            ),
        )
        for (const { store, fedimint } of [first, second]) {
            expect(fedimint.joinCommunity).toHaveBeenCalledTimes(1)
            expect(
                store.getState().federation.previouslyAutojoinedCommunities,
            ).toHaveProperty(['independent-community'])
        }
    })

    it('should suppress overlapping joins and remember only successful joins', async () => {
        const { store, fedimint } = setup()
        let complete!: (community: typeof mockCommunity) => void
        fedimint.joinCommunity.mockImplementation(
            () =>
                new Promise(resolve => {
                    complete = resolve
                }),
        )
        const args = { fedimint, code: 'concurrent-community' }
        const pending = store.dispatch(autojoinCommunity(args))
        const overlapping = store.dispatch(autojoinCommunity(args))
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(1)
        expect(
            store.getState().federation.previouslyAutojoinedCommunities,
        ).toEqual({})
        complete(mockCommunity)
        await pending.unwrap()
        await overlapping
        await store.dispatch(autojoinCommunity(args))
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(1)
        expect(
            store.getState().federation.previouslyAutojoinedCommunities,
        ).toHaveProperty([args.code])
    })

    it('should allow the existing developer reset to clear autojoin history', async () => {
        const { store, fedimint } = setup()
        const args = { fedimint, code: 'reset-community' }
        await store.dispatch(autojoinCommunity(args)).unwrap()
        store.dispatch(clearAutojoinedCommunitiesAndNotices())
        await store.dispatch(autojoinCommunity(args)).unwrap()
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(2)
    })

    it('should preserve existing membership and respect a later choice to leave', async () => {
        const { store, fedimint } = setup()
        store.dispatch(setCommunities([mockCommunity]))
        fedimint.joinCommunity.mockRejectedValue(new Error('already joined'))
        fedimint.leaveCommunity = jest.fn().mockResolvedValue(undefined)
        const args = { fedimint, code: mockCommunity.id }
        await store.dispatch(autojoinCommunity(args)).unwrap()
        expect(fedimint.joinCommunity).not.toHaveBeenCalled()
        expect(store.getState().federation.autojoinNoticesToDisplay).toEqual([])
        expect(
            store.getState().federation.previouslyAutojoinedCommunities,
        ).toHaveProperty([mockCommunity.id])
        await store
            .dispatch(
                leaveCommunity({ fedimint, communityId: mockCommunity.id }),
            )
            .unwrap()
        await store.dispatch(autojoinCommunity(args)).unwrap()
        expect(fedimint.joinCommunity).not.toHaveBeenCalled()
        expect(store.getState().federation.communities).toEqual([])
    })

    it('should share an in-flight invite join with an automatic join', async () => {
        const { store, fedimint } = setup()
        let complete!: (community: typeof mockCommunity) => void
        fedimint.joinCommunity.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    complete = resolve
                }),
        )
        fedimint.joinCommunity.mockRejectedValue(new Error('already joined'))
        const args = { fedimint, code: 'invite-community' }
        const inviteJoin = store.dispatch(joinCommunity(args))
        const automaticJoin = store.dispatch(autojoinCommunity(args))
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(1)
        complete(mockCommunity)
        expect(await inviteJoin.unwrap()).toEqual(mockCommunity)
        await automaticJoin.unwrap()
        expect(
            store.getState().federation.previouslyAutojoinedCommunities,
        ).toHaveProperty([args.code])
    })

    it('should finish selecting a community when a background autojoin is already running', async () => {
        const { store, fedimint } = setup()
        let complete!: (community: typeof mockCommunity) => void
        fedimint.joinCommunity.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    complete = resolve
                }),
        )
        fedimint.joinCommunity.mockRejectedValue(new Error('already joined'))
        const args = { fedimint, code: 'selected-community' }
        const background = store.dispatch(autojoinCommunity(args))
        const selected = store.dispatch(
            autojoinCommunity({ ...args, setAsSelected: true }),
        )
        expect(fedimint.joinCommunity).toHaveBeenCalledTimes(1)
        complete(mockCommunity)
        await Promise.all([background.unwrap(), selected.unwrap()])
        expect(store.getState().federation.lastSelectedCommunityId).toBe(
            mockCommunity.id,
        )
        expect(fedimint.listCommunities).toHaveBeenCalledTimes(1)
    })
})

describe('common/redux/federation › public federation previews', () => {
    const originalFetch = global.fetch
    const feed = {
        listed: {
            public: 'true',
            invite_code: 'listed-invite',
            federation_name: 'Feed name',
            preview_message: 'Feed welcome',
            federation_icon_url: 'https://feed.example/icon.png',
        },
        unnamed: { public: 'true', invite_code: 'unnamed-invite' },
    }
    const livePreview = (id: string): RpcFederationPreview => ({
        id,
        name: `Live ${id}`,
        meta: {
            welcome_message: `Live welcome ${id}`,
            federation_icon_url: `https://live.example/${id}.png`,
        },
        inviteCode: `${id}-invite`,
        returningMemberStatus: { type: 'newMember' },
    })
    const settle = () => new Promise(resolve => setTimeout(resolve, 0))

    beforeEach(() => {
        global.fetch = jest.fn().mockResolvedValue({
            json: () => Promise.resolve(feed),
        })
    })
    afterEach(() => {
        global.fetch = originalFetch
    })

    it('should show live previews over the feed copy after the preload', async () => {
        const store = setupStore()
        store.dispatch(setOnboardingCompleted(true))
        const fedimint = createMockFedimintBridge({
            federationPreview: (inviteCode: string) =>
                livePreview(inviteCode.replace('-invite', '')),
        })

        await store.dispatch(preloadFederationLists(fedimint)).unwrap()
        await settle()

        expect(selectPublicFederations(store.getState())).toEqual([
            expect.objectContaining({
                id: 'listed',
                name: 'Live listed',
                meta: expect.objectContaining({
                    preview_message: 'Live welcome listed',
                    federation_icon_url: 'https://live.example/listed.png',
                }),
            }),
            expect.objectContaining({
                id: 'unnamed',
                name: 'Live unnamed',
                meta: expect.objectContaining({
                    preview_message: 'Live welcome unnamed',
                }),
            }),
        ])
    })

    it('should keep the feed copy when a preview fails', async () => {
        const store = setupStore()
        store.dispatch(setOnboardingCompleted(true))
        const fedimint = createMockFedimintBridge({
            federationPreview: async () => {
                throw new Error('guardians unreachable')
            },
        })

        await store.dispatch(preloadFederationLists(fedimint)).unwrap()
        await settle()

        expect(selectPublicFederations(store.getState())).toEqual([
            expect.objectContaining({
                id: 'listed',
                name: 'Feed name',
                meta: expect.objectContaining({
                    preview_message: 'Feed welcome',
                    federation_icon_url: 'https://feed.example/icon.png',
                }),
            }),
        ])
    })

    it('should not preview before onboarding completes', async () => {
        const store = setupStore()
        const fedimint = createMockFedimintBridge({
            federationPreview: (inviteCode: string) =>
                livePreview(inviteCode.replace('-invite', '')),
        })

        await store.dispatch(preloadFederationLists(fedimint)).unwrap()
        await settle()

        expect(fedimint.federationPreview).not.toHaveBeenCalled()
    })
})
