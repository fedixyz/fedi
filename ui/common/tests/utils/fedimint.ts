import { okAsync } from 'neverthrow'

import { RpcMethods } from '../../types/bindings'
import { FedimintBridge } from '../../utils/fedimint'

// mock for when you need to pass a FedimintBridge to a hook
/**
 * Methods any wallet service screen calls on mount, whether or not the test
 * under way is about them. Each default is the neutral answer, so a test that
 * does not name one still renders instead of throwing on an absent mock.
 */
const AMBIENT_METHODS: Partial<Record<keyof RpcMethods, unknown>> = {
    // an empty admitted set means the publisher stops all new paid setup —
    // a valid authenticated answer, and the right neutral for a test that is
    // not about joining
    fiClientSetupPaymentFederations: () =>
        Promise.resolve({ type: 'federations', federations: [] }),
    // the top-up sheet polls this while a deposit invoice is on screen, to
    // catch a payment whose `transaction` event was lost to a backgrounded
    // app. No transactions is the neutral answer: nothing has landed yet.
    listTransactions: () => Promise.resolve([]),
}

export const createMockFedimintBridge = (
    overrides: Partial<Record<keyof RpcMethods, unknown>> = {},
): jest.Mocked<FedimintBridge> => {
    const methods = { ...AMBIENT_METHODS, ...overrides }
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
