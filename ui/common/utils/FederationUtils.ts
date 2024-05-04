import { z } from 'zod'

import { DEFAULT_FEDIMODS } from '@fedi/common/constants/fedimods'

import { XMPP_RESOURCE } from '../constants/xmpp'
import {
    ClientConfigMetadata,
    Federation,
    MSats,
    FediMod,
    SupportedCurrency,
    SupportedMetaFields,
    XmppConnectionOptions,
    PublicFederation,
    FederationListItem,
    Network,
    JoinPreview,
} from '../types'
import { RpcCommunity } from '../types/bindings'
import { FedimintBridge } from './fedimint'
import { makeLog } from './log'

const log = makeLog('common/utils/FederationUtils')

/**
 * This function is used to look for the meta URL to use as an external override
 * to any meta fields that may exist in consensus-signed metadata
 *
 * This fallback behavior is needed to preserve backwards compatibility since
 * fedimint uses meta_override_url and Fedi uses meta_external_url for essentially
 * the same behavior
 *
 * Fedi should phase out its use of meta_external_url and use the fedimint standard
 * meta_override_url but until all known federations stop using meta_external_url
 * we support both via this function
 */
export const getMetaUrl = (meta: ClientConfigMetadata): string | undefined => {
    const url = meta.meta_override_url || meta.meta_external_url || undefined
    if (!url) return undefined
    // Attempt to parse as JSON in case the URL is encoded as a JSON string
    try {
        const parsed: string = url && JSON.parse(url)
        return typeof parsed === 'string' ? parsed : url
    } catch (error) {
        // log.info(`getMetaUrl: error parsing meta url ${url}`, error)
        // no-op
        return url
    }
}

type ExternalMetaJson = Record<string, Federation['meta'] | undefined>

/**
 * Given a URL, attempt to fetch external metadata. Returns a promise
 * that resolves with the initial attempt to fetch external metadata. If the fetch
 * fails for any reason, returns undefined instead of throwing. If passed an
 * optional callback, will continue to attempt fetches in the background with
 * an increasing backoff and emit to the callback on success.
 */
const fetchExternalMetadata = async (
    externalUrl: string,
    onBackgroundSuccess?: (externalMeta: ExternalMetaJson) => void,
): Promise<ExternalMetaJson | undefined> => {
    const attemptFetch = async (timeout?: number) => {
        let controller: AbortController | undefined
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        if (timeout) {
            controller = new AbortController()
            timeoutId = setTimeout(() => {
                log.info(`Metadata fetch timed out after ${timeout}ms`)
                controller?.abort()
            }, timeout)
        }
        log.info('Fetching metadata from', externalUrl)
        const response = await fetch(externalUrl, {
            cache: 'no-cache',
            signal: controller?.signal,
        })
        const metaJson = await response.json()
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
        return metaJson
    }

    try {
        // If provided an onBackgroundSuccess, abort the initial fetch after
        // two seconds and try again shortly with no abort timer. Otherwise
        // allow the initial and only request to run for as long as it takes.
        const res = await attemptFetch(onBackgroundSuccess ? 2000 : undefined)
        return res
    } catch (err) {
        if (!onBackgroundSuccess) return
        let retryDelay = 1000
        const retryInBackground = async () => {
            try {
                await new Promise(resolve => setTimeout(resolve, retryDelay))
                const meta = await attemptFetch()
                onBackgroundSuccess(meta)
            } catch (error) {
                log.error('Failed to fetch metadata from external url', error)
                retryDelay += 3000
                log.info(
                    `Retrying fetch metadata in ${
                        retryDelay / 1000
                    } seconds...`,
                )
                retryInBackground() // Recursive call
            }
        }
        retryInBackground()
    }
}

/**
 * Runs `fetchFederationExternalMetadata` on a list of federations and assembles
 * the results as a map of federation id -> meta. Optional callback is called with
 * (federationId, meta).
 */
export const fetchFederationsExternalMetadata = async (
    federations: Pick<FederationListItem, 'id' | 'meta' | 'hasWallet'>[],
    onBackgroundSuccess?: (
        federationId: FederationListItem['id'],
        meta: FederationListItem['meta'],
    ) => void,
): Promise<ExternalMetaJson> => {
    // Given an external meta, return a list of federation id -> meta for all matching federations
    const getFederationMetaEntries = (externalMeta: ExternalMetaJson) => {
        const entries: [
            FederationListItem['id'],
            FederationListItem['meta'],
        ][] = []
        for (const federation of federations) {
            const fedMeta = externalMeta[federation.id]
            if (fedMeta) {
                entries.push([federation.id, fedMeta])
            }
        }
        return entries
    }

    // When results come in in the background, hit the callback for relevant federations
    const handleBackgroundSuccess = onBackgroundSuccess
        ? (externalMeta: ExternalMetaJson) => {
              const entries = getFederationMetaEntries(externalMeta)
              entries.forEach(([id, meta]) => onBackgroundSuccess(id, meta))
          }
        : undefined

    const communitiesMeta = federations
        .filter(f => !f.hasWallet)
        .reduce<ExternalMetaJson>((prev, community) => {
            if (!community || !community.id) return prev
            prev[community.id] = community.meta
            handleBackgroundSuccess && handleBackgroundSuccess(prev)
            return prev
        }, {})

    // Collect & deduplicate external meta URLs
    const externalUrls = federations
        .map(f => getMetaUrl(f.meta))
        .filter((url, idx, arr): url is string =>
            Boolean(url && arr.indexOf(url) === idx),
        )

    // Assemble all the promises and return the first pass of results. If they
    // provided onBackgroundSuccess, we'll call those as they come in.
    const federationsMeta = await Promise.all(
        externalUrls.map(async url =>
            fetchExternalMetadata(url, handleBackgroundSuccess),
        ),
    ).then(results =>
        results.reduce<ExternalMetaJson>((prev, extMeta) => {
            if (!extMeta) return prev
            const entries = getFederationMetaEntries(extMeta)
            for (const entry of entries) {
                prev[entry[0]] = entry[1]
            }
            return prev
        }, {}),
    )
    return { ...communitiesMeta, ...federationsMeta }
}

/**
 * Fetches any public federations from meta.json
 */
const FEDIBTC_META_JSON_URL = 'https://meta.dev.fedibtc.com/meta.json'
export const fetchPublicFederations = async (): Promise<PublicFederation[]> => {
    const publicFederations: PublicFederation[] = []
    try {
        const externalMetaJson = await fetchExternalMetadata(
            FEDIBTC_META_JSON_URL,
        )
        if (!externalMetaJson) throw new Error('No meta JSON to read from')
        Object.entries<Federation['meta'] | undefined>(
            externalMetaJson,
        ).forEach(([key, value]) => {
            if (!value) return
            // federation meta must have all of these fields to be displayed as public
            // Note these are not techincally supported meta fields... just the quickest
            // hack to be able to display public federations using the meta.json
            if (
                value.public &&
                value.public === 'true' &&
                value.invite_code &&
                value.preview_message
            ) {
                publicFederations.push({
                    id: key,
                    name:
                        getMetaField(
                            SupportedMetaFields.federation_name,
                            value,
                        ) || '',
                    meta: value,
                })
            }
        })
    } catch (error) {
        log.error('Failed to fetch public federations', error)
    }
    return publicFederations
}

const getMetaField = (
    field: SupportedMetaFields | 'sites' | 'fedimods' | 'default_group_chats',
    metadata: ClientConfigMetadata,
): string | null => {
    if (field === 'sites' || field === 'fedimods') {
        return (
            metadata[`fedi:fedimods`] ??
            metadata[`fedi:sites`] ??
            metadata.fedimods ??
            metadata.sites ??
            null
        )
    }

    if (field === 'default_matrix_rooms') {
        return metadata[`fedi:default_matrix_rooms`] ?? metadata[field] ?? null
    }

    if (Object.values(SupportedMetaFields).some(x => x === field)) {
        return metadata[`fedi:${field}`] ?? metadata[field] ?? null
    }

    return null
}

export const getFederationDefaultCurrency = (
    metadata: ClientConfigMetadata,
) => {
    return getMetaField(
        SupportedMetaFields.default_currency,
        metadata,
    ) as SupportedCurrency | null
}

export const getFederationFixedExchangeRate = (
    metadata: ClientConfigMetadata,
) => {
    const exchangeRate = getMetaField(
        SupportedMetaFields.fixed_exchange_rate,
        metadata,
    )

    if (typeof exchangeRate !== 'string') return null

    return Number(exchangeRate)
}

/** @deprecated xmpp */
export const getFederationChatServerDomain = (
    metadata: ClientConfigMetadata,
) => {
    return getMetaField(SupportedMetaFields.chat_server_domain, metadata)
}

export const makeChatServerOptions = (
    domain: string,
): XmppConnectionOptions => {
    return {
        domain,
        mucDomain: `muc.${domain}`,
        resource: XMPP_RESOURCE,
        service: `wss://${domain}/xmpp-websocket`,
    }
}

export const getFederationMaxBalanceMsats = (
    metadata: ClientConfigMetadata,
) => {
    const maxBalanceSats = getMetaField(
        SupportedMetaFields.max_balance_msats,
        metadata,
    )

    // This should just be a number but client config meta only
    // supports strings currently so will need to refactor
    return typeof maxBalanceSats !== 'string'
        ? undefined
        : (Number(maxBalanceSats) as MSats)
}

export const getFederationMaxInvoiceMsats = (
    metadata: ClientConfigMetadata,
) => {
    const maxInvoiceMsats = getMetaField(
        SupportedMetaFields.max_invoice_msats,
        metadata,
    )
    // This should just be a number but client config meta only
    // supports strings currently so will need to refactor
    return typeof maxInvoiceMsats !== 'string'
        ? undefined
        : (Number(maxInvoiceMsats) as MSats)
}

export const getFederationMaxStableBalanceMsats = (
    metadata: ClientConfigMetadata,
) => {
    const maxStableBalanceMsats = getMetaField(
        SupportedMetaFields.max_stable_balance_msats,
        metadata,
    )

    return typeof maxStableBalanceMsats !== 'string'
        ? undefined
        : (Number(maxStableBalanceMsats) as MSats)
}

// The utils below all involve the same inverse default logic where they
// should return true unless explicitly disabled via feature flag
export const shouldShowInviteCode = (metadata: ClientConfigMetadata) => {
    // This is a boolean true/false but client config meta only
    // supports strings currently so will need to refactor
    return (
        getMetaField(SupportedMetaFields.invite_codes_disabled, metadata) !==
        'true'
    )
}

export const shouldShowJoinFederation = (metadata: ClientConfigMetadata) => {
    return (
        getMetaField(SupportedMetaFields.new_members_disabled, metadata) !==
        'false'
    )
}

export const shouldShowSocialRecovery = (federation: FederationListItem) => {
    // Social recovery not supported on v0 federations
    if (federation.version === 0) {
        return false
    }

    return (
        getMetaField(
            SupportedMetaFields.social_recovery_disabled,
            federation.meta,
        ) !== 'true'
    )
}

export const shouldShowOfflineWallet = (
    metadata: ClientConfigMetadata,
): boolean => {
    return (
        getMetaField(SupportedMetaFields.offline_wallet_disabled, metadata) !==
        'true'
    )
}

export const shouldEnableOnchainDeposits = (metadata: ClientConfigMetadata) => {
    const onchainDepositsDisabled = getMetaField(
        SupportedMetaFields.onchain_deposits_disabled,
        metadata,
    )
    // Disable onchain deposits by default if not specified in meta
    return onchainDepositsDisabled === null
        ? false
        : onchainDepositsDisabled !== 'true'
}

export const shouldEnableFediInternalInjection = (
    metadata: ClientConfigMetadata,
) => {
    const fediInternalInjectionDisabled = getMetaField(
        SupportedMetaFields.fedi_internal_injection_disabled,
        metadata,
    )
    // Disable fedi internal injection by default if not specified in meta
    return fediInternalInjectionDisabled === null
        ? true
        : fediInternalInjectionDisabled !== 'true'
}

export const shouldEnableStabilityPool = (metadata: ClientConfigMetadata) => {
    const stabilityPoolDisabled = getMetaField(
        SupportedMetaFields.stability_pool_disabled,
        metadata,
    )
    // Disable stability pool by default if not specified in meta
    return stabilityPoolDisabled === null
        ? false
        : stabilityPoolDisabled !== 'true'
}

export const shouldEnableNostr = (federation: FederationListItem) => {
    // Nostr RPCs not supported on v0 federations
    if (federation.version === 0) {
        return false
    }

    return true
}

// TODO: Determine if no-wallet communities breaks this
export function supportsSingleSeed(federation: FederationListItem) {
    return federation.version >= 2
}

export const getFederationGroupChats = (
    metadata: ClientConfigMetadata,
): string[] => {
    const defaultGroupChats =
        getMetaField(SupportedMetaFields.default_matrix_rooms, metadata) ??
        getMetaField(SupportedMetaFields.default_group_chats, metadata)

    if (defaultGroupChats) {
        try {
            return JSON.parse(defaultGroupChats)
        } catch (err) {
            log.warn('Failed to parse default groupchats', defaultGroupChats)
        }
    }
    return []
}

export const getFederationFediMods = (
    metadata: ClientConfigMetadata,
): FediMod[] => {
    const sites = getMetaField('sites', metadata)
    const fediModSchema: z.ZodSchema<FediMod> = z.object({
        id: z.string(),
        title: z.string(),
        url: z.string().url(),
        imageUrl: z.string().url().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
    })

    if (sites) {
        try {
            const fediMods: Array<FediMod> = JSON.parse(sites)

            if (!Array.isArray(fediMods)) {
                throw new Error('Expected array of fedi mods')
            }

            return fediMods.reduce(
                (result: Array<FediMod>, { imageUrl, ...mod }: FediMod) => {
                    const res = fediModSchema.safeParse(mod)

                    if (res.success && res.data) {
                        if (!imageUrl) {
                            return result.concat(mod)
                        }

                        return result.concat({
                            ...mod,
                            imageUrl,
                        })
                    }
                    return result
                },
                [] as Array<FediMod>,
            )
        } catch (err) {
            log.error((err as Error | z.ZodError).message)
            log.warn(
                'Failed to parse federation fedimods, falling back to defaults',
                sites,
            )
        }
    }

    // FIXME: if metadata fails to fetch, we render an empty array since this
    // would be less confusing than showing a totally different set of Fedimods
    // there shoud be a proper loader / robust handling for figuring out if we
    // should fallback on default Fedimods
    return []
    return DEFAULT_FEDIMODS
}

type PopupInfo = {
    endTimestamp: string
    countdownMessage: string | null
    endedMessage: string | null
}

export const getFederationPopupInfo = (
    metadata: ClientConfigMetadata,
): PopupInfo | null => {
    const endTimestamp = getMetaField(
        SupportedMetaFields.popup_end_timestamp,
        metadata,
    )
    if (!endTimestamp) return null

    const countdownMessage = getMetaField(
        SupportedMetaFields.popup_countdown_message,
        metadata,
    )
    const endedMessage = getMetaField(
        SupportedMetaFields.popup_ended_message,
        metadata,
    )
    return {
        endTimestamp,
        countdownMessage,
        endedMessage,
    }
}

export const getFederationTosUrl = (metadata: ClientConfigMetadata) => {
    return getMetaField(SupportedMetaFields.tos_url, metadata)
}

export const getFederationName = (metadata: ClientConfigMetadata) => {
    return getMetaField(SupportedMetaFields.federation_name, metadata)
}

export const getFederationWelcomeMessage = (metadata: ClientConfigMetadata) => {
    return getMetaField(SupportedMetaFields.welcome_message, metadata)
}

export const getFederationPinnedMessage = (metadata: ClientConfigMetadata) => {
    return getMetaField(SupportedMetaFields.pinned_message, metadata)
}

export const getFederationIconUrl = (metadata: ClientConfigMetadata) => {
    return getMetaField(SupportedMetaFields.federation_icon_url, metadata)
}

export const getIsFederationSupported = (
    federation: Pick<FederationListItem, 'version' | 'hasWallet'>,
) => {
    if (
        federation.hasWallet &&
        (federation.version === 0 || federation.version === 1)
    ) {
        return false
    }
    return true
}

/**
 * Fetch information about a federation without using the bridge wasm. This
 * allows us to fetch federation info before the bridge is loaded.
 */
async function getFederationPreview(
    inviteCode: string,
    fedimint: FedimintBridge,
): Promise<JoinPreview> {
    let externalMeta = {}
    // The federation preview may have an external URL where the meta
    // fields need to be fetched from... otherwise we won't know about chat
    // servers after joining which will break onboarding
    // TODO: Refactor this to the bridge...?
    // const preview = await previewInvite(fedimint, inviteCode)
    const preview = await fedimint.federationPreview(inviteCode)
    try {
        const metaUrl = getMetaUrl(preview.meta)
        if (metaUrl) {
            log.info(
                `Found metaUrl in preview for federation ${preview.id}, fetching...`,
            )
            const response = await fetch(metaUrl, {
                cache: 'no-cache',
            })
            const metaJson = await response.json()
            if (metaJson[preview.id]) {
                externalMeta = metaJson[preview.id]
            }
            log.info(`Found external meta for federation ${preview.id}`)
        }
    } catch (error) {
        log.error(
            `Failed to fetch external meta for federation preview ${preview.id}`,
        )
    }
    return {
        ...preview,
        name:
            getFederationName(externalMeta) ||
            getFederationName(preview.meta) ||
            preview.name,
        meta: {
            ...preview.meta,
            ...externalMeta,
        },
        hasWallet: true,
    }
}

export const coerceFederationListItem = (
    community: RpcCommunity,
): FederationListItem => {
    return {
        hasWallet: false as const,
        network: undefined,

        // We cannot really guarantee unique IDs in the body since community creators
        // have free reign to modify the JSON as they see fit. So to prevent erroneous
        // code being built on the assumption of unique IDs, we just remove it altogether.
        // The client is currently using the ID only for indexing, and it is just as
        // easy to use the invite code for indexing (which will actually guaranteed to be unique)
        //
        // ref: https://thefedi.slack.com/archives/C03RGASQ21W/p1720461259496419?thread_ts=1720211284.294199&cid=C03RGASQ21W
        id: community.inviteCode,
        ...community,
    }
}

export const coerceJoinPreview = (preview: RpcCommunity): JoinPreview => {
    const { inviteCode, ...rest } = preview

    return {
        hasWallet: false as const,
        id: inviteCode,
        inviteCode,
        network: undefined,
        ...rest,
    }
}

export const detectInviteCodeType = (
    code: string,
): 'federation' | 'community' => {
    // TODO: Implement better validation
    if (code.toLowerCase().startsWith('fed1')) {
        return 'federation'
    } else if (code.toLowerCase().startsWith('fedi:community')) {
        return 'community'
    } else {
        throw new Error('Invalid invite code')
    }
}

/**
 * detects if the code belongs to a federation or a no-wallet
 * community and joins the appropriate one. It then coerces
 * the result into a FederationListItem
 * @param code
 */
export const joinFromInvite = async (
    fedimint: FedimintBridge,
    code: string,
): Promise<FederationListItem> => {
    const codeType = detectInviteCodeType(code)
    if (codeType === 'federation') {
        log.info(`joinFromInvite: joining federation with code '${code}'`)
        const { network, ...federation } = await fedimint.joinFederation(code)
        return {
            ...federation,
            hasWallet: true,
            network: network as Network,
        }
    } else {
        // community
        log.info(`joinFromInvite: joining community with code '${code}'`)
        const community = await fedimint.joinCommunity({ inviteCode: code })
        return coerceFederationListItem(community)
    }
}

export const previewInvite = async (
    fedimint: FedimintBridge,
    code: string,
): Promise<JoinPreview> => {
    const codeType = detectInviteCodeType(code)
    log.info(`previewInvite: codeType is '${codeType}'`)
    if (codeType === 'federation') {
        return await getFederationPreview(code, fedimint)
    } else {
        const preview = await fedimint.communityPreview({
            inviteCode: code,
        })
        return coerceJoinPreview(preview)
    }
}
