import {
    Federation,
    FediMod,
    LoadedFederation,
    MSats,
    SupportedCurrency,
} from '../../types'
import {
    getFederationDefaultCurrency,
    getFederationFediMods,
    shouldShowInviteCode,
} from '../../utils/FederationUtils'

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
    hasWallet: true,
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
            const fediMods = getFederationFediMods(fedWithMods.meta)
            expect(fediMods[0]).toEqual(testMod)
        })
        it('returns fedimods from metadata when using legacy sites key', () => {
            const fediMods = getFederationFediMods({
                sites: JSON.stringify([testMod]),
            })
            expect(fediMods[0]).toEqual(testMod)
        })
        it('returns an empty array if not provided', () => {
            const fediMods = getFederationFediMods(fedWithNoMetadata.meta)
            expect(fediMods).toHaveLength(0)
        })
        it('returns an empty array if type is invalid', () => {
            const fediMods = getFederationFediMods({
                fedimods: 'invalid type here',
            })
            expect(fediMods).toHaveLength(0)
        })
        it('omits imageUrl from mods if null', () => {
            const fediMods = getFederationFediMods(fedWithModsNullImageUrl.meta)

            expect(fediMods[0]).toHaveProperty('imageUrl')
            expect(fediMods[1]).not.toHaveProperty('imageUrl')
        })
    })
})
