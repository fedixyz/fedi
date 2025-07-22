import { z } from 'zod'

import { DEFAULT_FEDIMODS } from '@fedi/common/constants/fedimods'

import {
    FederationMetadata,
    Community,
    Federation,
    FederationListItem,
    FederationStatus,
    FediMod,
    JoinPreview,
    LightningGateway,
    LoadedFederation,
    MSats,
    PublicFederation,
    SupportedMetaFields,
    SelectableCurrency,
} from '../types'
import { GuardianStatus, RpcCommunity, RpcFederation } from '../types/bindings'
import { isDev } from './environment'
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
export const getMetaUrl = (meta: FederationMetadata): string | undefined => {
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

type ExternalMetaJson = Record<string, Community['meta'] | undefined>

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
        onBackgroundSuccess && onBackgroundSuccess(metaJson)
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
 *
 * Note this currently seems very overcomplicated since it doesn't
 * need to handle multiple communities with external meta urls anymore
 * and it wasn't worth refactoring to remove the extra complexity.
 *
 * TODO: Remove this function entirely when the bridge can provide us with the global
 * community meta and we don't have to fetch it ourselves
 */
export const fetchFederationsExternalMetadata = async (
    communitiesToFetch: Pick<Community, 'id' | 'meta' | 'hasWallet'>[],
    onBackgroundSuccess?: (
        federationId: Community['id'],
        meta: Community['meta'],
    ) => void,
): Promise<ExternalMetaJson> => {
    // Given an external meta, return a list of federation id -> meta for all matching federations
    const getMetaEntries = (externalMeta: ExternalMetaJson) => {
        const entries: [
            FederationListItem['id'],
            FederationListItem['meta'],
        ][] = []
        for (const community of communitiesToFetch) {
            const communityMeta = externalMeta[community.id]
            if (communityMeta) {
                entries.push([community.id, communityMeta])
            }
        }
        return entries
    }

    // When results come in in the background, hit the callback for relevant federations
    const handleBackgroundSuccess = onBackgroundSuccess
        ? (externalMeta: ExternalMetaJson) => {
              const entries = getMetaEntries(externalMeta)
              entries.forEach(
                  ([id, meta]) => meta && onBackgroundSuccess(id, meta),
              )
          }
        : undefined

    // Collect & deduplicate external meta URLs
    const externalUrls = communitiesToFetch
        .map(c => getMetaUrl(c.meta))
        .filter((url, idx, arr): url is string =>
            Boolean(url && arr.indexOf(url) === idx),
        )

    // Assemble all the promises and return the first pass of results. If they
    // provided onBackgroundSuccess, we'll call those as they come in.
    const communitiesMeta = await Promise.all([
        ...externalUrls.map(url => {
            return fetchExternalMetadata(url, res => {
                return handleBackgroundSuccess && handleBackgroundSuccess(res)
            })
        }),
    ]).then(results => {
        return results.reduce<ExternalMetaJson>((prev, extMeta) => {
            if (!extMeta) return prev
            const entries = getMetaEntries(extMeta)
            for (const entry of entries) {
                prev[entry[0]] = entry[1]
            }
            return prev
        }, {})
    })
    return communitiesMeta
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
                (value.public &&
                    value.public === 'true' &&
                    value.invite_code &&
                    value.preview_message) ||
                // in development only, always show Fedi Testnet in public federations for easier testing
                (isDev() && value.federation_name === 'Fedi Testnet')
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

export const getMetaField = (
    field: SupportedMetaFields | 'sites' | 'fedimods' | 'default_group_chats',
    metadata: FederationMetadata,
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

    // this allows the fedimint-specific meta field `federation_expiry_timestamp` to trigger the expiring federation logic
    if (field === 'popup_end_timestamp') {
        return (
            metadata[`fedi:${field}`] ??
            metadata[field] ??
            metadata['federation_expiry_timestamp'] ??
            null
        )
    }

    if (Object.values(SupportedMetaFields).some(x => x === field)) {
        return metadata[`fedi:${field}`] ?? metadata[field] ?? null
    }

    return null
}

export const getFederationDefaultCurrency = (metadata: FederationMetadata) => {
    return getMetaField(
        SupportedMetaFields.default_currency,
        metadata,
    ) as SelectableCurrency | null
}

export const getFederationFixedExchangeRate = (
    metadata: FederationMetadata,
) => {
    const exchangeRate = getMetaField(
        SupportedMetaFields.fixed_exchange_rate,
        metadata,
    )

    if (typeof exchangeRate !== 'string') return null

    return Number(exchangeRate)
}

export const getFederationMaxBalanceMsats = (metadata: FederationMetadata) => {
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

export const getFederationMaxInvoiceMsats = (metadata: FederationMetadata) => {
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
    metadata: FederationMetadata,
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
export const shouldShowInviteCode = (metadata: FederationMetadata) => {
    // This is a boolean true/false but client config meta only
    // supports strings currently so will need to refactor
    return (
        getMetaField(SupportedMetaFields.invite_codes_disabled, metadata) !==
        'true'
    )
}

export const shouldShowJoinFederation = (metadata: FederationMetadata) => {
    return (
        getMetaField(SupportedMetaFields.new_members_disabled, metadata) !==
        'false'
    )
}

export const shouldShowSocialRecovery = (federation: LoadedFederation) => {
    const moduleEnabled = hasSocialModule(federation)

    // if social_recovery_disabled meta field is:
    // not set      => true (enabled)
    // set to false => true (enabled)
    // set to true  => false (disabled)
    const isNotDisabledInMeta =
        getMetaField(
            SupportedMetaFields.social_recovery_disabled,
            federation.meta,
        ) !== 'true'

    return moduleEnabled && isNotDisabledInMeta
}

export const shouldShowOfflineWallet = (
    metadata: FederationMetadata,
): boolean => {
    return (
        getMetaField(SupportedMetaFields.offline_wallet_disabled, metadata) !==
        'true'
    )
}

export const shouldEnableOnchainDeposits = (metadata: FederationMetadata) => {
    const onchainDepositsDisabled = getMetaField(
        SupportedMetaFields.onchain_deposits_disabled,
        metadata,
    )
    // Enable onchain deposits by default if not specified in meta
    return onchainDepositsDisabled === null
        ? true
        : onchainDepositsDisabled !== 'true'
}

export const shouldEnableStabilityPool = (metadata: FederationMetadata) => {
    const stabilityPoolDisabled = getMetaField(
        SupportedMetaFields.stability_pool_disabled,
        metadata,
    )
    // Disable stability pool by default if not specified in meta
    return stabilityPoolDisabled === null
        ? false
        : stabilityPoolDisabled !== 'true'
}

export const hasMultispendEnabled = (metadata: FederationMetadata) => {
    const multispendDisabledMeta = getMetaField(
        SupportedMetaFields.multispend_disabled,
        metadata,
    )
    // if multispend_disabled meta field is:
    // set to false => true (multispend should be ENABLED)
    if (multispendDisabledMeta === 'false') return true
    // set to true  => false (multispend should be DISABLED)
    if (multispendDisabledMeta === 'true') return false
    // not set      => false (multispend should be DISABLED)
    return false
}

export const hasMultispendModule = (federation: LoadedFederation) => {
    if (!federation.clientConfig) return false
    const { modules } = federation.clientConfig
    for (const key in modules) {
        // TODO: add better typing for this
        const fmModule = modules[key] as Partial<{ kind: string }>
        if (fmModule.kind === 'multi_sig_stability_pool') {
            return true
        }
    }
}

export const hasSocialModule = (federation: LoadedFederation) => {
    if (!federation.clientConfig) return false
    const { modules } = federation.clientConfig
    for (const key in modules) {
        // TODO: add better typing for this
        const fmModule = modules[key] as Partial<{ kind: string }>
        if (fmModule.kind === 'fedi-social') {
            return true
        }
    }
}

export const getFederationGroupChats = (
    metadata: FederationMetadata,
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
    metadata: FederationMetadata,
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
    metadata: FederationMetadata,
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

export const getFederationTosUrl = (metadata: FederationMetadata) => {
    return getMetaField(SupportedMetaFields.tos_url, metadata)
}

export const getFederationName = (
    federation: FederationListItem | JoinPreview,
): string => {
    let name = ''
    if ('meta' in federation && federation.meta) {
        name =
            getMetaField(
                SupportedMetaFields.federation_name,
                federation.meta,
            ) || ''
    }
    // if no name is found in meta, try the name directly on the federation
    if (
        !name &&
        'name' in federation &&
        federation.name &&
        typeof federation.name === 'string'
    ) {
        name = federation.name || ''
    }
    return name
}

export const getFederationWelcomeMessage = (metadata: FederationMetadata) => {
    return getMetaField(SupportedMetaFields.welcome_message, metadata)
}

export const getFederationPinnedMessage = (metadata: FederationMetadata) => {
    return getMetaField(SupportedMetaFields.pinned_message, metadata)
}

export const getFederationIconUrl = (metadata: FederationMetadata) => {
    return getMetaField(SupportedMetaFields.federation_icon_url, metadata)
}

export const getIsFederationSupported = (federation: JoinPreview) => {
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
    const preview = await fedimint.federationPreview(inviteCode)
    return {
        ...preview,
        name: preview.meta.federation_name || preview.name,
        hasWallet: true,
    }
}

export const coerceLoadedFederation = (
    federation: { init_state: 'ready' } & RpcFederation,
): LoadedFederation => {
    /*
     *  Client-side network failure will cause getFederationStatus to
     *  hang and timeout after 10 seconds so we assume online by default
     *  and instead fetch the status in the background. This should mean
     *  a smoother UX since we avoid flickering indicators
     */
    return {
        ...federation,
        status: 'online',
        hasWallet: true,
    }
}

export const coerceFederationListItem = (
    community: RpcCommunity,
): FederationListItem => {
    return {
        hasWallet: false,
        network: undefined,
        status: 'online',
        init_state: 'ready',

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
        hasWallet: false,
        id: inviteCode,
        inviteCode,
        status: 'online',
        network: undefined,
        init_state: 'ready',
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
    recoverFromScratch = false,
): Promise<FederationListItem> => {
    const codeType = detectInviteCodeType(code)
    if (codeType === 'federation') {
        log.info(`joinFromInvite: joining federation with code '${code}'`)
        const { ...federation } = await fedimint.joinFederation(
            code,
            recoverFromScratch,
        )
        const status = await getFederationStatus(fedimint, federation.id)
        // TODO: Show a warning to the user depending on the status
        return {
            ...federation,
            hasWallet: true,
            status,
            init_state: 'ready',
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

export const getGuardianStatuses = async (
    fedimint: FedimintBridge,
    federationId: string,
): Promise<GuardianStatus[]> => {
    return fedimint.getGuardianStatus(federationId)
}

export const switchGateway = async (
    fedimint: FedimintBridge,
    federationId: string,
    nodePubKey: string,
): Promise<void> => {
    await fedimint.switchGateway(nodePubKey, federationId)
}

export const getFederationStatus = async (
    fedimint: FedimintBridge,
    federationId: FederationListItem['id'],
): Promise<FederationStatus> => {
    const guardianStatuses = await fedimint.getGuardianStatus(federationId)
    const offlineGuardians = guardianStatuses.filter(status => {
        // Guardian is online
        if ('online' in status) return false
        // TODO: handle other unusual states we may see here to qualify connection health?
        else return true
    })
    if (offlineGuardians.length === 0) {
        return 'online'
    }
    // A federation can achieve consensus if 3f + 1 guardians are online,
    // where f is the number of "faulty" guardians.
    if (3 * offlineGuardians.length + 1 <= guardianStatuses.length) {
        return 'unstable'
    }
    return 'offline'
}

export const getGatewaysList = async (
    fedimint: FedimintBridge,
    federationId: string,
): Promise<LightningGateway[]> => {
    return fedimint.listGateways(federationId)
}
