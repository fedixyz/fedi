import type {
    RpcFaReplacementCheck,
    RpcFaStatus,
} from '@fedi/common/types/bindings'

import type { FaWorld } from './world'

export type FaScriptContext = {
    formationId: string
    /** payloads of every `awaitRpc` already passed, by method */
    recorded: Record<string, Record<string, unknown>>
    world: FaWorld
}

export type FaWalletServiceJoin = 'ready' | 'joining' | 'recovering' | 'failed'

export type StubHandler = (
    payload: Record<string, unknown>,
    ctx: FaScriptContext,
) => unknown

type Lazy<T> = T | ((ctx: FaScriptContext) => T)

export type FaStep =
    | { kind: 'reply'; method: string; value: Lazy<unknown> }
    | { kind: 'stub'; method: string; handler: StubHandler }
    | { kind: 'act'; run: (ctx: FaScriptContext) => void }
    | { kind: 'stream'; status: Lazy<RpcFaStatus> }
    | { kind: 'candidates'; check: Lazy<RpcFaReplacementCheck | null> }
    | { kind: 'emit'; event: string; payload: Lazy<unknown> }
    | { kind: 'wait'; ms: number }
    | { kind: 'awaitRpc'; method: string; recorded: Record<string, unknown> }
    | { kind: 'checkpoint'; name: string }
    | { kind: 'formWalletService'; join: FaWalletServiceJoin }

export type FaScript = { name: string; steps: FaStep[] }

export function reply(
    method: string,
    value: (ctx: FaScriptContext) => unknown,
): FaStep
export function reply(method: string, value: unknown): FaStep
export function reply(method: string, value: unknown): FaStep {
    return { kind: 'reply', method, value: value as Lazy<unknown> }
}
export const stream = (status: Lazy<RpcFaStatus>): FaStep => ({
    kind: 'stream',
    status,
})
/** Publish a replacement check on the candidates stream. */
export const candidates = (
    check: Lazy<RpcFaReplacementCheck | null>,
): FaStep => ({ kind: 'candidates', check })
export function emit(
    event: string,
    payload: (ctx: FaScriptContext) => unknown,
): FaStep
export function emit(event: string, payload: unknown): FaStep
export function emit(event: string, payload: unknown): FaStep {
    return { kind: 'emit', event, payload: payload as Lazy<unknown> }
}
export const wait = (ms: number): FaStep => ({ kind: 'wait', ms })
export const awaitRpc = (
    method: string,
    recorded: Record<string, unknown>,
): FaStep => ({ kind: 'awaitRpc', method, recorded })
export const checkpoint = (name: string): FaStep => ({
    kind: 'checkpoint',
    name,
})
export const formWalletService = (join: FaWalletServiceJoin): FaStep => ({
    kind: 'formWalletService',
    join,
})
/** Answer every call of `method` until the simulator resets; async handlers are fine. */
export const stub = (method: string, handler: StubHandler): FaStep => ({
    kind: 'stub',
    method,
    handler,
})
/** Change the world between steps, e.g. a seat price or the fleet size. */
export const act = (run: (ctx: FaScriptContext) => void): FaStep => ({
    kind: 'act',
    run,
})

export function script(name: string, steps: FaStep[]): FaScript {
    return { name, steps }
}

export function checkpointsOf(target: FaScript): string[] {
    return target.steps.flatMap(step =>
        step.kind === 'checkpoint' ? [step.name] : [],
    )
}

export function resolveLazy<T>(value: Lazy<T>, ctx: FaScriptContext): T {
    return typeof value === 'function'
        ? (value as (ctx: FaScriptContext) => T)(ctx)
        : value
}
