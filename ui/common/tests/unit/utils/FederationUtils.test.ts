import {
    Federation,
    FediMod,
    LoadedFederation,
    MSats,
    SupportedCurrency,
} from '../../../types'
import {
    getFederationDefaultCurrency,
    getCommunityFediMods,
    shouldShowInviteCode,
    fetchPublicFederations,
    fetchAutoSelectFederations,
} from '../../../utils/FederationUtils'

const SAMPLE_CHAT_SERVER_DOMAIN = 'chat.dev.fedibtc.com'

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
    hadReusedEcash: false,
    status: 'online',
    init_state: 'ready',
}

const fedWithNoMetadata: Federation = {
    ...baseFed,
    meta: {},
}

const fedWithDeprecatedFields: Federation = {
    ...baseFed,
    meta: {
        default_currency: SupportedCurrency.EUR,
        chat_server_domain: SAMPLE_CHAT_SERVER_DOMAIN,
    },
}

const fedWithFediPrefixedFields: Federation = {
    ...baseFed,
    meta: {
        'fedi:default_currency': SupportedCurrency.EUR,
        'fedi:chat_server_domain': SAMPLE_CHAT_SERVER_DOMAIN,
    },
}

const fedWithBothFields: Federation = {
    ...baseFed,
    meta: {
        default_currency: SupportedCurrency.EUR,
        chat_server_domain: SAMPLE_CHAT_SERVER_DOMAIN,
        'fedi:default_currency': SupportedCurrency.EUR,
        'fedi:chat_server_domain': SAMPLE_CHAT_SERVER_DOMAIN,
    },
}

const fedInvitesDisabled: Federation = {
    ...baseFed,
    meta: {
        default_currency: SupportedCurrency.EUR,
        chat_server_domain: SAMPLE_CHAT_SERVER_DOMAIN,
        invite_codes_disabled: 'true',
    },
}

const fedInvitesEnabled: Federation = {
    ...baseFed,
    meta: {
        default_currency: SupportedCurrency.EUR,
        chat_server_domain: SAMPLE_CHAT_SERVER_DOMAIN,
        invite_codes_disabled: 'false',
    },
}

const testMod: FediMod = {
    id: 'test-mod',
    title: 'Test Mod',
    url: 'https://test-mod-url.com',
    imageUrl: 'https://test-mod-url.com/image.png',
}

const fedWithMods: Federation = {
    ...baseFed,
    meta: {
        fedimods: JSON.stringify([testMod]),
    },
}

const testModNullImageUrl: FediMod = {
    id: 'test-mod-null-image-url',
    title: 'Test Mod (No Image URL)',
    url: 'https://test-mod-url.com',
    imageUrl: null,
}

const fedWithModsNullImageUrl: Federation = {
    ...baseFed,
    meta: {
        fedimods: JSON.stringify([testMod, testModNullImageUrl]),
    },
}

const mockPublicFedMeta = {
    'fed-id-1': {
        public: 'true',
        invite_code: 'fed11abc',
        federation_name: 'Test Federation 1',
    },
    'fed-id-2': {
        public: 'true',
        invite_code: 'fed11def',
        federation_name: 'Test Federation 2',
    },
}

const mockPrivateFedMeta = {
    'fed-id-private': {
        public: 'false',
        invite_code: 'fed11xyz',
        federation_name: 'Private Federation',
    },
}

const mockExpiredFedMeta = {
    'fed-id-expired': {
        public: 'true',
        invite_code: 'fed11expired',
        federation_name: 'Expired Federation',
        federation_expiry_timestamp: '1000000000',
    },
}

const mockMixedMeta = {
    ...mockPublicFedMeta,
    ...mockPrivateFedMeta,
    ...mockExpiredFedMeta,
    'fed-id-incomplete': {
        public: 'true',
        // missing invite_code
        federation_name: 'Incomplete Federation',
    },
}

describe('FederationUtils', () => {
    describe('getFederationDefaultCurrency', () => {
        test.each([
            fedWithDeprecatedFields,
            fedWithFediPrefixedFields,
            fedWithBothFields,
        ])('returns federation currency from metadata', federation => {
            const defaultCurrency = getFederationDefaultCurrency(
                federation.meta,
            )

            expect(defaultCurrency).toEqual(SupportedCurrency.EUR)
        })
        it('returns null if not supported', () => {
            const defaultCurrency = getFederationDefaultCurrency(
                fedWithNoMetadata.meta,
            )

            expect(defaultCurrency).toBeNull()
        })
    })
    describe('shouldShowInviteCode', () => {
        it('returns false if configured in metadata', () => {
            const showInviteCode = shouldShowInviteCode(fedInvitesDisabled.meta)

            expect(showInviteCode).toEqual(false)
        })
        it('returns true if configured in metadata', () => {
            const showInviteCode = shouldShowInviteCode(fedInvitesEnabled.meta)

            expect(showInviteCode).toEqual(true)
        })
        it('returns true if not supported', () => {
            const showInviteCode = shouldShowInviteCode(fedWithNoMetadata.meta)

            expect(showInviteCode).toEqual(true)
        })
    })
    describe('getFederationFediMods', () => {
        it('returns fedimods from metadata', () => {
            const fediMods = getCommunityFediMods(fedWithMods.meta)
            expect(fediMods[0]).toEqual(testMod)
        })
        it('returns fedimods from metadata when using legacy sites key', () => {
            const fediMods = getCommunityFediMods({
                sites: JSON.stringify([testMod]),
            })
            expect(fediMods[0]).toEqual(testMod)
        })
        it('returns an empty array if not provided', () => {
            const fediMods = getCommunityFediMods(fedWithNoMetadata.meta)
            expect(fediMods).toHaveLength(0)
        })
        it('returns an empty array if type is invalid', () => {
            const fediMods = getCommunityFediMods({
                fedimods: 'invalid type here',
            })
            expect(fediMods).toHaveLength(0)
        })
        it('omits imageUrl from mods if null', () => {
            const fediMods = getCommunityFediMods(fedWithModsNullImageUrl.meta)

            expect(fediMods[0]).toHaveProperty('imageUrl')
            expect(fediMods[1]).not.toHaveProperty('imageUrl')
        })
    })

    describe('federation fetchers', () => {
        const originalFetch = global.fetch

        beforeEach(() => jest.clearAllMocks())
        afterEach(() => {
            global.fetch = originalFetch
        })

        const mockFetch = (data: unknown) => {
            global.fetch = jest.fn().mockResolvedValue({
                json: () => Promise.resolve(data),
            })
        }

        it('should parse public federations from API response', async () => {
            mockFetch(mockPublicFedMeta)
            const result = await fetchPublicFederations()
            expect(result).toHaveLength(2)
            expect(result[0].name).toBe('Test Federation 1')
        })

        it('should filter out non-public, incomplete, and expired federations', async () => {
            mockFetch(mockMixedMeta)
            const result = await fetchPublicFederations()
            expect(result).toHaveLength(2)
            const names = result.map(f => f.name)
            expect(names).not.toContain('Private Federation')
            expect(names).not.toContain('Incomplete Federation')
            expect(names).not.toContain('Expired Federation')
        })

        it('should return empty array on network failure', async () => {
            global.fetch = jest
                .fn()
                .mockRejectedValue(new Error('Network error'))
            expect(await fetchPublicFederations()).toEqual([])
            expect(await fetchAutoSelectFederations()).toEqual([])
        })

        it('should fetch auto-select federations from dedicated endpoint', async () => {
            mockFetch(mockPublicFedMeta)
            const result = await fetchAutoSelectFederations()
            expect(result).toHaveLength(2)
            expect(result[0].meta.invite_code).toBe('fed11abc')
        })
    })
})
