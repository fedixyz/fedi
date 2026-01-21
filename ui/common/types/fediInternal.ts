import { ParseKeys } from 'i18next'
import { RequestInvoiceArgs } from 'webln'

import { InjectionMessageType } from '@fedi/injections/src'

import { isDev, isNightly } from '../utils/environment'
import { FediMod } from './fedimint'

export type EcashRequest = Omit<RequestInvoiceArgs, 'defaultMemo'>

export type FediInternalVersion = 3

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
    'manageCommunities',
    'manageInstalledMiniApps',
    'navigation',
] as const
export type MiniAppPermissionType = (typeof miniAppPermissionTypes)[number]

// using a map allows us to distinguish between true (always allow), false (always deny), and undefined (ask every time)
export type RememberedPermissionsMap = Partial<
    Record<MiniAppPermissionType, boolean | undefined>
>
export type MiniAppPermissionsByUrlOrigin = {
    [urlOrigin: string]: RememberedPermissionsMap
}

export const MiniAppPermissionInfoLookup: Record<
    MiniAppPermissionType,
    {
        displayNameTranslationKey: ParseKeys
        descriptionTranslationKey: ParseKeys
        iconName: string
    }
> = {
    manageCommunities: {
        descriptionTranslationKey:
            'feature.permissions.manage-communities-description',
        displayNameTranslationKey:
            'feature.permissions.manage-communities-display-name',
        iconName: 'Community',
    },
    manageInstalledMiniApps: {
        descriptionTranslationKey:
            'feature.permissions.manage-installed-mini-apps-description',
        displayNameTranslationKey:
            'feature.permissions.manage-installed-mini-apps-display-name',
        iconName: 'Download',
    },
    navigation: {
        descriptionTranslationKey: 'feature.permissions.navigation-description',
        displayNameTranslationKey:
            'feature.permissions.navigation-display-name',
        iconName: 'Globe',
    },
}

const NIGHTLY_PERMISSIONS: MiniAppPermissionsByUrlOrigin = {
    'https://fedi-catalog-staging.vercel.app': {
        manageInstalledMiniApps: true,
    },
    'http://localhost:3023': {
        manageInstalledMiniApps: true,
    },
    'https://community-tool-two.vercel.app': {
        manageCommunities: true,
        navigation: true,
    },
}
// in dev locally running mini-apps have all permissions by default
// change as needed
const ALL_MINI_APP_PERMISSIONS_ENABLED: RememberedPermissionsMap =
    miniAppPermissionTypes.reduce((acc, permissionType) => {
        return {
            ...acc,
            [permissionType]: true,
        }
    }, {})

const DEV_PERMISSIONS: MiniAppPermissionsByUrlOrigin = {
    'http://localhost': { ...ALL_MINI_APP_PERMISSIONS_ENABLED },
    'http://localhost:3022': { ...ALL_MINI_APP_PERMISSIONS_ENABLED },
    'http://127.0.0.1': { ...ALL_MINI_APP_PERMISSIONS_ENABLED },
    'http://10.0.2.2:3022': { ...ALL_MINI_APP_PERMISSIONS_ENABLED }, // host for android emulator
    // so devs can use staging version of 1st party miniapps if they want
    ...NIGHTLY_PERMISSIONS,
}

// these are "first party" miniapps pre-authorized with certain default permissions
export const FIRST_PARTY_PERMISSIONS: MiniAppPermissionsByUrlOrigin = {
    'https://fedi-catalog.vercel.app': {
        manageInstalledMiniApps: true,
    },
    'https://community-generator.fedi.xyz': {
        manageCommunities: true,
        navigation: true,
    },
    ...(isNightly() ? NIGHTLY_PERMISSIONS : {}),
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
    [InjectionMessageType.fedi_previewMatrixRoom]: ['manageCommunities'],
}
