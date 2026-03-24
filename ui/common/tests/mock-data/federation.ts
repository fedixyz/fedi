import {
    MSats,
    Federation,
    Community,
    CommunityPreview,
    LoadedFederation,
} from '@fedi/common/types'

import { RpcFederationPreview } from '../../types/bindings'

export const mockFederation1 = {
    status: 'online',
    init_state: 'ready',
    balance: 2000000 as MSats,
    id: '1',
    network: 'bitcoin',
    name: 'test-federation',
    inviteCode: 'test',
    meta: {},
    recovering: false,
    nodes: {},
    clientConfig: null,
    fediFeeSchedule: {
        modules: {},
        remittanceThresholdMsat: 10000,
    },
    hadReusedEcash: false,
} as const satisfies Federation

export const mockFederationWithSPV1: LoadedFederation = {
    ...mockFederation1,
    id: 'spv1',
    meta: {
        stability_pool_disabled: 'false',
        multispend_disabled: 'false',
    },
    clientConfig: {
        global: {},
        modules: {
            stability_pool: {
                kind: 'stability_pool',
            },
        },
    },
}

export const mockFederation2: Federation = {
    status: 'online',
    init_state: 'ready',
    balance: 2000000 as MSats,
    id: '2',
    network: 'bitcoin',
    name: 'test-federation-2',
    inviteCode: 'test',
    meta: {},
    recovering: false,
    nodes: {},
    clientConfig: null,
    fediFeeSchedule: {
        modules: {},
        remittanceThresholdMsat: 10000,
    },
    hadReusedEcash: false,
} as const satisfies Federation

export const mockFederationWithSPV2: LoadedFederation = {
    ...mockFederation2,
    id: 'spv2',
    meta: {
        stability_pool_disabled: 'false',
        multispend_disabled: 'false',
    },
    clientConfig: {
        global: {},
        modules: {
            multi_sig_stability_pool: {
                kind: 'multi_sig_stability_pool',
            },
        },
    },
}

export const mockCommunity: Community = {
    id: '1',
    communityInvite: {
        type: 'legacy',
        invite_code_str: 'test',
        community_meta_url: 'https://test.com',
    },
    name: 'name',
    meta: {
        pinned_message: 'pinned message',
    },
    status: 'active',
}

const MOCK_FEDERATION_PREVIEW: RpcFederationPreview = {
    id: '1',
    name: 'test-federation',
    inviteCode: 'test',
    meta: {},
    returningMemberStatus: {
        type: 'returningMember',
    },
}

export const createMockFederationPreview = (
    overrides: Partial<RpcFederationPreview> = {},
): RpcFederationPreview => {
    return {
        ...MOCK_FEDERATION_PREVIEW,
        ...overrides,
    }
}

const MOCK_COMMUNITY_PREVIEW: CommunityPreview = {
    ...mockCommunity,
    returningMemberStatus: { type: 'unknown' },
    version: 1,
}

export const createMockCommunityPreview = (
    overrides: Partial<CommunityPreview> = {},
): CommunityPreview => {
    return {
        ...MOCK_COMMUNITY_PREVIEW,
        ...overrides,
    }
}
