import { InjectionMessageType as T } from '@fedi/injections/src/types'
import { sendInjectorMessage } from '@fedi/injections/src/utils'

const CALL_TIMEOUT_MS = 15000
let msgId = 0

export async function dispatch(type: T, data: unknown): Promise<unknown> {
    const id = ++msgId
    // defineApi() validated data against the message type at construction.
    const request = { id, type, data } as Parameters<
        typeof sendInjectorMessage
    >[0]
    const controller = new AbortController()
    const timer = setTimeout(
        () =>
            controller.abort(
                new Error(
                    `Timed out after ${CALL_TIMEOUT_MS}ms - is the native bridge attached?`,
                ),
            ),
        CALL_TIMEOUT_MS,
    )
    try {
        return await sendInjectorMessage(request, controller.signal)
    } finally {
        clearTimeout(timer)
    }
}
