import { MSats, FederationListItem } from '@fedi/common/types'

export const mockFederation1: FederationListItem = {
    status: 'online',
    init_state: 'ready',
    hasWallet: true,
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

export const mockFederation2: FederationListItem = {
    status: 'online',
    init_state: 'ready',
    hasWallet: true,
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

export const mockCommunity: FederationListItem = {
    id: '1',
    status: 'online',
    network: undefined,
    hasWallet: false,
    init_state: 'ready',
    inviteCode: 'test',
    name: 'name',
    meta: {},
}
