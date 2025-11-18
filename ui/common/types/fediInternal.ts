import { RequestInvoiceArgs } from 'webln'

import { InjectionMessageType } from '@fedi/injections/src'

import { isDev } from '../utils/environment'
import { FediMod } from './fedimint'

export type EcashRequest = Omit<RequestInvoiceArgs, 'defaultMemo'>

export type FediInternalVersion = 2

export type InstallMiniAppRequest = Omit<FediMod, 'color'>

// https://www.notion.so/fedi21/Meta-Fields-Federations-Communities-Split-25ceb0892aa08027a92ecb006a3fa51b
// Stripped fedi: prefix as it's not needed
// Removed invite_code, since it gets added by the bridge
export type CommunityMeta = {
    welcome_message?: string
    name: string
    tos_url?: string
    federation_icon_url?: string
    invite_codes_disabled?: 'true' | 'false'
    new_members_disabled?: 'true' | 'false'
    preview_message?: string
    pinned_message?: string
    // Will get stringified before passing to the bridge
    default_group_chats?: string[]
    // Will get stringified before passing to the bridge
    fedimods?: {
        id: string
        title: string
        url: string
        imageUrl: string
    }[]
}

export type CreateCommunityRequest = CommunityMeta
export type EditCommunityRequest = {
    communityId: string
    editedCommunity: CommunityMeta
}

// this matches the CacheMode type in react-native-webview/lib/WebViewTypes.d.ts
export type FediModCacheMode =
    | 'LOAD_DEFAULT'
    | 'LOAD_CACHE_ONLY'
    | 'LOAD_CACHE_ELSE_NETWORK'
    | 'LOAD_NO_CACHE'

export const miniAppPermissionTypes = [
    'manageInstalledMiniApps',
    'manageCommunities',
    'navigation',
] as const
export type MiniAppPermissionType = (typeof miniAppPermissionTypes)[number]
export type MiniAppPermissionsById = Partial<
    Record<string, MiniAppPermissionType[]>
>

// in dev locally running mini-apps have all permissions by default
// change as needed
const DEV_PERMISSIONS: MiniAppPermissionsById = {
    'http://localhost': [...miniAppPermissionTypes],
    'http://127.0.0.1': [...miniAppPermissionTypes],
    'http://10.0.2.2': [...miniAppPermissionTypes], // host for android emulator
}

// these are "first party" miniapps pre-authorized with certain default permissions
export const FIRST_PARTY_PERMISSIONS: MiniAppPermissionsById = {
    'https://fedi-catalog.vercel.app': ['manageInstalledMiniApps'],
    'https://community-generator.fedi.xyz': ['manageCommunities', 'navigation'],
    ...(isDev() ? DEV_PERMISSIONS : {}),
}

export const INJECTION_HANDLERS_PERMISSIONS_MAP: Partial<{
    [T in InjectionMessageType]: MiniAppPermissionType[]
}> = {
    // handlers that should be protected behind permissions will be defined here
    [InjectionMessageType.fedi_createCommunity]: ['manageCommunities'],
    [InjectionMessageType.fedi_editCommunity]: ['manageCommunities'],
    [InjectionMessageType.fedi_listCreatedCommunities]: ['manageCommunities'],
    [InjectionMessageType.fedi_joinCommunity]: ['manageCommunities'],
    [InjectionMessageType.fedi_refreshCommunities]: ['manageCommunities'],
    [InjectionMessageType.fedi_setSelectedCommunity]: ['manageCommunities'],
    [InjectionMessageType.fedi_selectPublicChats]: ['manageCommunities'],
    [InjectionMessageType.fedi_getInstalledMiniApps]: [
        'manageInstalledMiniApps',
    ],
    [InjectionMessageType.fedi_installMiniApp]: ['manageInstalledMiniApps'],
    [InjectionMessageType.fedi_navigateHome]: ['navigation'],
}
