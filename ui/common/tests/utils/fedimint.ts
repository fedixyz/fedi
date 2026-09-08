import { okAsync } from 'neverthrow'

import { RpcMethods } from '../../types/bindings'
import { FedimintBridge } from '../../utils/fedimint'

// mock for when you need to pass a FedimintBridge to a hook
/**
 * Only the methods you name exist on the result, so calling any other one is a
 * TypeError. Never add a shared default here: it answers for every test in the
 * repo, including the ones that meant to assert on that call.
 */
export const createMockFedimintBridge = (
    methods: Partial<Record<keyof RpcMethods, unknown>> = {},
): jest.Mocked<FedimintBridge> => {
    const mockBridge: Record<string, jest.Mock> = {
        rpc: jest.fn(),
        rpcTyped: jest.fn(),
        addListener: jest.fn(() => () => {}),
    }

    // Allow all methods to be used in `rpcResult`
    mockBridge.rpcResult = jest.fn().mockImplementation((method: string) => {
        if (method in methods && methods?.[method as keyof typeof methods])
            return okAsync(methods[method as keyof typeof methods])

        return okAsync()
    })

    // Add the RPC method directly to the mockBridge object
    // for direct methods like `fedimint.generateInvoice`
    for (const [key, value] of Object.entries(methods)) {
        mockBridge[key] =
            typeof value === 'function'
                ? jest.fn(value as (...args: unknown[]) => unknown)
                : jest.fn().mockImplementation(() => value)
    }

    return mockBridge as unknown as jest.Mocked<FedimintBridge>
}
export type MockFedimintBridge = ReturnType<typeof createMockFedimintBridge>
