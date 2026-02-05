import {
    MSats,
    Federation,
    Community,
    CommunityPreview,
} from '@fedi/common/types'

import { RpcFederationPreview } from '../../types/bindings'

export const mockFederation1: Federation = {
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
