import { MSats } from '../../types'
import {
    Community,
    Federation,
    FederationListItem,
    LoadedFederation,
    SupportedCurrency,
} from '../../types/fedimint'
import { upsertListItem } from '../../utils/redux'

const baseFed: LoadedFederation = {
    id: 'fedid',
    name: 'testfed',
    inviteCode: 'tesfedinvitecode',
    nodes: { '0': { name: 'alpha', url: 'alphaurl' } },
    balance: 0 as MSats,
    recovering: false,
    network: 'regtest',
    clientConfig: null,
    meta: {},
    fediFeeSchedule: {
        remittanceThresholdMsat: 100_000,
        modules: {},
    },
    hasWallet: true,
    hadReusedEcash: false,
    status: 'online',
    init_state: 'ready',
}
const testFederation1: Federation = {
    ...baseFed,
    id: 'id1',
    name: 'Federation 1',
}
const testFederation2: Federation = {
    ...baseFed,
    id: 'id2',
    name: 'Federation 2',
}
const testFederation3: Federation = {
    ...baseFed,
    id: 'id3',
    name: 'Federation 3',
}
const testCommunity: Community = {
    id: 'id3',
    name: 'Community 1',
    inviteCode: 'testcommunityinvitecode',
    init_state: 'ready',
    hasWallet: false,
    status: 'online',
    meta: {},
    network: undefined,
}
const testFederations: FederationListItem[] = [
    { ...testFederation1 },
    { ...testFederation2 },
]

describe('Redux Utils', () => {
    describe('upsertListItem', () => {
        it('should add a new item to the list if it does not exist', () => {
            const result = upsertListItem<FederationListItem>(
                [...testFederations],
                testFederation3,
            )
            expect(result).toHaveLength(3)
            expect(result).toContainEqual(testFederation1)
            expect(result).toContainEqual(testFederation2)
            expect(result).toContainEqual(testFederation3)
        })

        it('should update an existing item in the list', () => {
            const updatedFederation1 = {
                ...testFederation1,
                name: 'Updated Federation 1',
            }
            const result = upsertListItem<FederationListItem>(
                [...testFederations],
                updatedFederation1,
            )
            expect(result).toHaveLength(2)
            expect(result).toContainEqual(updatedFederation1)
            expect(result).not.toContainEqual(testFederation1)
        })

        it('should return the same list reference if the item is identical', () => {
            const list = [testFederation1]
            const result = upsertListItem<FederationListItem>(list, {
                ...testFederation1,
                name: 'Federation 1',
            })
            expect(result).toBe(list)
        })

        const testFederationWithMeta: Federation = {
            ...testFederation1,
            meta: { 'fedi:pinned_message': 'This is a message' },
        }
        const testFederationWithUpdatedMeta: Federation = {
            ...testFederation1,
            meta: { 'fedi:default_currency': SupportedCurrency.USD },
        }
        it('should replace meta when not provided in nestedFields', () => {
            const result = upsertListItem<FederationListItem>(
                [testFederationWithMeta],
                testFederationWithUpdatedMeta,
            )
            expect(result).toHaveLength(1)
            expect(result[0].meta).toEqual(testFederationWithUpdatedMeta.meta)
        })
        it('should merge meta when provided in nestedFields', () => {
            const result = upsertListItem<FederationListItem>(
                [testFederationWithMeta],
                testFederationWithUpdatedMeta,
                ['meta'],
            )
            expect(result).toHaveLength(1)
            const resultMeta = result[0].meta
            expect(resultMeta).toHaveProperty('fedi:default_currency')
            expect(resultMeta).toHaveProperty('fedi:pinned_message')
        })

        it('should sort the list when a sort function is provided', () => {
            const sortFn = (entities: FederationListItem[]) =>
                entities.sort((a, b) =>
                    (a as LoadedFederation).name.localeCompare(
                        (b as LoadedFederation).name,
                    ),
                )
            const result = upsertListItem<FederationListItem>(
                testFederations,
                { ...testCommunity },
                undefined,
                sortFn,
            )
            expect(result).toEqual([
                { ...testCommunity },
                testFederations[0],
                testFederations[1],
            ])
        })
    })
})
