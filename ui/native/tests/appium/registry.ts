import { AppiumTestBase } from '../configs/appium/AppiumTestBase'
import { Platform } from '../configs/appium/types'
import { ChatTimeline } from './common/ChatTimeline.test'
import { JoinLeaveFederation } from './common/JoinLeaveFederation.test'
import { Settings } from './common/Settings.test'
import { BackupRestore } from './common/backupRestore.test'
import { OnboardingTest } from './common/onboarding.test'

export type TestClass = (new () => AppiumTestBase) & {
    prerequisites: readonly string[]
    produces: readonly string[]
    supportedPlatforms?: readonly Platform[]
    actors: number
}

// Actor handles the runner can drive, in order. 'a' is primary (maps to the
// unsuffixed DEVICE_ID/AVD); each extra handle needs its own device.
export const ACTOR_HANDLES = ['a', 'b'] as const

export const availableTests: Record<string, TestClass> = {
    onboarding: OnboardingTest,
    settings: Settings,
    joinLeaveFederations: JoinLeaveFederation,
    chatTimeline: ChatTimeline,
    backupRestore: BackupRestore,
}

export type TestName = keyof typeof availableTests

// Resolve CLI test args (which may be "all" or a subset) to concrete names.
export function resolveTestNames(args: string[]): string[] {
    if (args.includes('all')) return Object.keys(availableTests)
    return args
}

// How many devices the selected tests need: the max `actors` across them
// (min 1), capped at ACTOR_HANDLES.length since the runner can't drive more.
// A test declaring more than that throws in the runner with a clear message.
// Single source of truth the boot scripts read via required-actors.ts.
export function requiredActorCount(args: string[]): number {
    let max = 1
    for (const name of resolveTestNames(args)) {
        const TestClass = availableTests[name]
        if (!TestClass) continue
        max = Math.max(max, TestClass.actors ?? 1)
    }
    return Math.min(max, ACTOR_HANDLES.length)
}
