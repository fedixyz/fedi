import type { RpcFiStatus } from '@fedi/common/types/bindings'

import { IDLE_STATUS } from './status'
import {
    FiScript,
    FiScriptContext,
    FiWalletServiceJoin,
    checkpointsOf,
    resolveLazy,
} from './steps'
import type { FiWorld } from './world'

export interface PlayerHost {
    setStatus(status: RpcFiStatus): void
    emitEvent(event: string, payload: unknown): void
    setReply(method: string, value: unknown): void
    setStub(
        method: string,
        handler: (payload: Record<string, unknown>) => unknown,
    ): void
    onRpc(method: string): Promise<Record<string, unknown>>
    formWalletService(join: FiWalletServiceJoin): void
    nextFormationId(): string
    world: FiWorld
}

type Run = {
    script: string
    checkpoint: string | null
    cancelled: boolean
    timer: ReturnType<typeof setTimeout> | null
    release: (() => void) | null
}

export class FiPlayer {
    private active: Run | null = null

    constructor(private readonly host: PlayerHost) {}

    get current(): { script: string; checkpoint: string | null } | null {
        return this.active
            ? { script: this.active.script, checkpoint: this.active.checkpoint }
            : null
    }

    cancel() {
        const run = this.active
        if (!run) return
        run.cancelled = true
        if (run.timer) clearTimeout(run.timer)
        run.timer = null
        run.release?.()
        run.release = null
    }

    async run(target: FiScript, options: { jumpTo?: string } = {}) {
        if (options.jumpTo && !checkpointsOf(target).includes(options.jumpTo)) {
            throw new Error(
                `unknown checkpoint "${options.jumpTo}" in script "${target.name}"`,
            )
        }
        this.cancel()
        const run: Run = {
            script: target.name,
            checkpoint: null,
            cancelled: false,
            timer: null,
            release: null,
        }
        this.active = run
        const ctx: FiScriptContext = {
            formationId: this.host.nextFormationId(),
            recorded: {},
            world: this.host.world,
        }
        // idle first so redux drops the previous formation's high-water mark
        this.host.setStatus(IDLE_STATUS)
        let jumping = Boolean(options.jumpTo)

        for (const step of target.steps) {
            if (run.cancelled) return
            switch (step.kind) {
                case 'reply':
                    this.host.setReply(
                        step.method,
                        resolveLazy(step.value, ctx),
                    )
                    break
                case 'stub':
                    this.host.setStub(step.method, payload =>
                        step.handler(payload, ctx),
                    )
                    break
                case 'act':
                    step.run(ctx)
                    break
                case 'stream':
                    this.host.setStatus(resolveLazy(step.status, ctx))
                    break
                case 'emit':
                    this.host.emitEvent(
                        step.event,
                        resolveLazy(step.payload, ctx),
                    )
                    break
                case 'formWalletService':
                    this.host.formWalletService(step.join)
                    break
                case 'checkpoint':
                    run.checkpoint = step.name
                    if (step.name === options.jumpTo) jumping = false
                    break
                case 'wait':
                    if (jumping) break
                    await new Promise<void>(resolve => {
                        run.release = resolve
                        run.timer = setTimeout(() => {
                            run.timer = null
                            run.release = null
                            resolve()
                        }, step.ms)
                    })
                    break
                case 'awaitRpc':
                    if (jumping) {
                        ctx.recorded[step.method] = step.recorded
                        break
                    }
                    ctx.recorded[step.method] = await Promise.race([
                        this.host.onRpc(step.method),
                        new Promise<Record<string, unknown>>(resolve => {
                            run.release = () => resolve(step.recorded)
                        }),
                    ])
                    run.release = null
                    break
            }
        }
    }
}
