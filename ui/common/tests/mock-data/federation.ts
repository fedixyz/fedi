import { MSats, Federation, Community } from '@fedi/common/types'

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
    inviteCode: 'test',
    name: 'name',
    meta: {},
}
