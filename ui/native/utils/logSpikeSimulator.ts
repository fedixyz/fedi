import { Vibration } from 'react-native'

import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('logSpikeSimulator')

export type LogSpikeConfig = {
    logsPerSpike: number
    intervalMs: number
    complex: boolean
}

let intervalHandle: ReturnType<typeof setInterval> | undefined
let activeConfig: LogSpikeConfig | undefined

function fireSpike(count: number, complex: boolean) {
    Vibration.vibrate(40)
    const startedAt = Date.now()
    for (let i = 0; i < count; i++) {
        if (complex) {
            log.info('complex spike entry', {
                i,
                timestamp: Date.now(),
                roomId: `!room-${i}:matrix.example.org`,
                user: {
                    id: `@user-${i}:matrix.example.org`,
                    displayName: `Test User ${i}`,
                    avatarUrl: `mxc://matrix.example.org/avatar-${i}`,
                    powerLevel: 50,
                },
                event: {
                    type: 'm.room.message',
                    content: {
                        msgtype: 'm.text',
                        body: `Message body to make JSON.stringify nontrivial. iteration=${i}`,
                        formatted_body: `<p>Iteration <strong>${i}</strong></p>`,
                        format: 'org.matrix.custom.html',
                    },
                    sender: `@sender-${i}:matrix.example.org`,
                    origin_server_ts: Date.now(),
                    unsigned: {
                        age: i * 1000,
                        transaction_id: `m${i}.${Date.now()}`,
                    },
                },
                tags: ['network', 'matrix', 'spike-test', `iter-${i % 100}`],
            })
        } else {
            log.info(`spike i=${i}`)
        }
    }
    const label = complex ? 'complex' : 'simple'
    log.info(
        `${label} log spike: ${count} logs queued in ${Date.now() - startedAt}ms`,
    )
}

export function startLogSpikeSimulator(config: LogSpikeConfig) {
    if (intervalHandle !== undefined) return
    activeConfig = config
    const label = config.complex ? 'complex' : 'simple'
    log.info(
        `starting ${label} log spike: ${config.logsPerSpike} logs every ${config.intervalMs}ms`,
    )
    fireSpike(config.logsPerSpike, config.complex)
    intervalHandle = setInterval(
        () => fireSpike(config.logsPerSpike, config.complex),
        config.intervalMs,
    )
}

export function stopLogSpikeSimulator() {
    if (intervalHandle === undefined) return
    log.info('stopping log spike simulator')
    Vibration.cancel()
    clearInterval(intervalHandle)
    intervalHandle = undefined
    activeConfig = undefined
}

export function isLogSpikeSimulatorRunning() {
    return intervalHandle !== undefined
}

export function getLogSpikeConfig() {
    return activeConfig
}
