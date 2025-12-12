import { act, waitFor } from '@testing-library/react'

import { useClaimEcash, useParseEcash } from '@fedi/common/hooks/pay'
import { setupStore } from '@fedi/common/redux'
import * as federationsSlice from '@fedi/common/redux/federation'
import { MSats } from '@fedi/common/types'
import * as federationUtils from '@fedi/common/utils/FederationUtils'

import {
    MockFedimintBridge,
    createMockFedimintBridge,
} from '../../utils/fedimint'
import { renderHookWithState } from '../../utils/render'

const mockDispatch = jest.fn()
jest.mock('@fedi/common/hooks/redux', () => ({
    ...jest.requireActual('@fedi/common/hooks/redux'),
    useCommonDispatch: () => mockDispatch,
}))

describe('common/hooks/pay', () => {
    let mockFedimint: MockFedimintBridge
    const store = setupStore()

    beforeEach(() => {
        jest.clearAllMocks()
        mockFedimint = createMockFedimintBridge({
            parseEcash: jest.fn(),
            receiveEcash: jest.fn(),
        })
    })

    describe('useParseEcash', () => {
        describe('When the parseEcash function is called', () => {
            it('should call the fedimint parseEcash function with the token value', async () => {
                const parseEcashSpy = jest.spyOn(mockFedimint, 'parseEcash')

                const { result } = renderHookWithState(
                    () => useParseEcash(mockFedimint),
                    store,
                )

                act(() => {
                    result.current.parseEcash('mock-ecash-token')
                })

                await waitFor(() => {
                    expect(parseEcashSpy).toHaveBeenCalledWith(
                        'mock-ecash-token',
                    )
                })
            })
        })

        describe('When the parsedEcash response includes an federation_invite', () => {
            it('should call the getFederationPreview util function with the federation_invite value', async () => {
                jest.spyOn(mockFedimint, 'parseEcash').mockResolvedValue({
                    federation_type: 'notJoined',
                    federation_invite: 'mock-federation-invite',
                    amount: 10000 as MSats,
                })

                const getFederationPreviewSpy = jest.spyOn(
                    federationUtils,
                    'getFederationPreview',
                )

                const { result } = renderHookWithState(
                    () => useParseEcash(mockFedimint),
                    store,
                )

                act(() => {
                    result.current.parseEcash('mock-ecash-token')
                })

                await waitFor(() => {
                    expect(getFederationPreviewSpy).toHaveBeenCalledWith(
                        'mock-federation-invite',
                        mockFedimint,
                    )
                })
            })
        })
    })

    describe('useClaimEcash', () => {
        describe('When the claimEcash function is called', () => {
            it('should dispatch receiveEcash', async () => {
                const { result } = renderHookWithState(
                    () => useClaimEcash(mockFedimint),
                    store,
                )

                act(() => {
                    result.current.claimEcash(
                        {
                            federation_type: 'joined',
                            federation_id: '1',
                            amount: 10000 as MSats,
                        },
                        'mock-ecash-token',
                    )
                })

                // dispatch should be called one time for receiveEcash
                await waitFor(() => {
                    expect(mockDispatch).toHaveBeenCalled()
                })
            })
        })

        describe('When the claimEcash function is called with a federation_invite in the parsedEcash', () => {
            let joinFederationSpy: jest.SpyInstance

            beforeEach(() => {
                joinFederationSpy = jest.spyOn(
                    federationsSlice,
                    'joinFederation',
                )
            })

            afterEach(() => {
                joinFederationSpy.mockRestore()
            })

            it('should dispatch joinFederation with the federation_invite value', async () => {
                const { result } = renderHookWithState(
                    () => useClaimEcash(mockFedimint),
                    store,
                )

                act(() => {
                    result.current.claimEcash(
                        {
                            federation_type: 'notJoined',
                            federation_invite: 'mock-federation-invite',
                            amount: 10000 as MSats,
                        },
                        'mock-ecash-token',
                    )
                })

                await waitFor(() => {
                    expect(joinFederationSpy).toHaveBeenCalled()
                })
            })
        })
    })
})
