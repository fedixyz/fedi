import type { StorageApi } from '../../types'

export type FiSimulatorSwitch = 'on' | 'off'
export type FiPayerSource = 'real' | 'mock' | 'none'

export interface FiDevSwitches {
    simulator: FiSimulatorSwitch
    payerSource: FiPayerSource
}

export const DEFAULT_FI_DEV_SWITCHES: FiDevSwitches = {
    simulator: 'on',
    payerSource: 'mock',
}

export const FI_DEV_SWITCHES_KEY = 'fedi:devtools:fi'

const SIMULATOR_VALUES: FiSimulatorSwitch[] = ['on', 'off']
const PAYER_SOURCE_VALUES: FiPayerSource[] = ['real', 'mock', 'none']

const pick = <T extends string>(
    value: unknown,
    allowed: T[],
    fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback)

export async function loadFiDevSwitches(
    storage: StorageApi,
): Promise<FiDevSwitches> {
    const raw = await storage.getItem(FI_DEV_SWITCHES_KEY)
    if (!raw) return DEFAULT_FI_DEV_SWITCHES
    let parsed: Partial<FiDevSwitches> = {}
    try {
        parsed = JSON.parse(raw)
    } catch {
        return DEFAULT_FI_DEV_SWITCHES
    }
    return {
        simulator: pick(
            parsed.simulator,
            SIMULATOR_VALUES,
            DEFAULT_FI_DEV_SWITCHES.simulator,
        ),
        payerSource: pick(
            parsed.payerSource,
            PAYER_SOURCE_VALUES,
            DEFAULT_FI_DEV_SWITCHES.payerSource,
        ),
    }
}

export async function saveFiDevSwitches(
    storage: StorageApi,
    switches: FiDevSwitches,
): Promise<void> {
    await storage.setItem(FI_DEV_SWITCHES_KEY, JSON.stringify(switches))
}
