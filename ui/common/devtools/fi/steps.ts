import type { RpcFiStatus } from '../../types/bindings'
import type { FiWorld } from './world'

export type FiScriptContext = {
    formationId: string
    /** payloads of every `awaitRpc` already passed, by method */
    recorded: Record<string, Record<string, unknown>>
    world: FiWorld
}

export type FiWalletServiceJoin = 'ready' | 'joining' | 'recovering' | 'failed'

export type StubHandler = (
    payload: Record<string, unknown>,
    ctx: FiScriptContext,
) => unknown

type Lazy<T> = T | ((ctx: FiScriptContext) => T)

export type FiStep =
    | { kind: 'reply'; method: string; value: Lazy<unknown> }
    | { kind: 'stub'; method: string; handler: StubHandler }
    | { kind: 'act'; run: (ctx: FiScriptContext) => void }
    | { kind: 'stream'; status: Lazy<RpcFiStatus> }
    | { kind: 'emit'; event: string; payload: Lazy<unknown> }
    | { kind: 'wait'; ms: number }
    | { kind: 'awaitRpc'; method: string; recorded: Record<string, unknown> }
    | { kind: 'checkpoint'; name: string }
    | { kind: 'formWalletService'; join: FiWalletServiceJoin }

export type FiScript = { name: string; steps: FiStep[] }

export function reply(
    method: string,
    value: (ctx: FiScriptContext) => unknown,
): FiStep
export function reply(method: string, value: unknown): FiStep
export function reply(method: string, value: unknown): FiStep {
    return { kind: 'reply', method, value: value as Lazy<unknown> }
}
export const stream = (status: Lazy<RpcFiStatus>): FiStep => ({
    kind: 'stream',
    status,
})
export function emit(
    event: string,
    payload: (ctx: FiScriptContext) => unknown,
): FiStep
export function emit(event: string, payload: unknown): FiStep
export function emit(event: string, payload: unknown): FiStep {
    return { kind: 'emit', event, payload: payload as Lazy<unknown> }
}
export const wait = (ms: number): FiStep => ({ kind: 'wait', ms })
export const awaitRpc = (
    method: string,
    recorded: Record<string, unknown>,
): FiStep => ({ kind: 'awaitRpc', method, recorded })
export const checkpoint = (name: string): FiStep => ({
    kind: 'checkpoint',
    name,
})
export const formWalletService = (join: FiWalletServiceJoin): FiStep => ({
    kind: 'formWalletService',
    join,
})
/** Answer every call of `method` until the simulator resets; async handlers are fine. */
export const stub = (method: string, handler: StubHandler): FiStep => ({
    kind: 'stub',
    method,
    handler,
})
/** Change the world between steps, e.g. a seat price or the fleet size. */
export const act = (run: (ctx: FiScriptContext) => void): FiStep => ({
    kind: 'act',
    run,
})

export function script(name: string, steps: FiStep[]): FiScript {
    return { name, steps }
}

export function checkpointsOf(target: FiScript): string[] {
    return target.steps.flatMap(step =>
        step.kind === 'checkpoint' ? [step.name] : [],
    )
}

export function resolveLazy<T>(value: Lazy<T>, ctx: FiScriptContext): T {
    return typeof value === 'function'
        ? (value as (ctx: FiScriptContext) => T)(ctx)
        : value
}
