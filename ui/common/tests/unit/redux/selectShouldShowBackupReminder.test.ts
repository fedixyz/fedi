import {
    BACKUP_REMINDER_ELAPSED_MS,
    selectShouldShowBackupReminder,
    setupStore,
} from '../../../redux'

type StoreOverrides = {
    balanceSats?: number
    dismissedThisSession?: boolean
    countdownStartedAt?: number | null
    featureEnabled?: boolean
    hasPerformedPersonalBackup?: boolean
    hasReachedBackupReminderThreshold?: boolean
    onboardingMethod?: 'new_seed' | 'restored' | null
}

const buildStore = ({
    balanceSats = 0,
    countdownStartedAt = null,
    dismissedThisSession = false,
    featureEnabled = true,
    onboardingMethod = 'new_seed',
    hasPerformedPersonalBackup = false,
    hasReachedBackupReminderThreshold = false,
}: StoreOverrides) =>
    setupStore({
        federation: {
            federations: [
                {
                    meta: {},
                    id: 'fed-1',
                    recovering: false,
                    init_state: 'ready',
                    name: 'Test Federation',
                    balance: balanceSats * 1000,
                },
            ],
            recentlyUsedFederationIds: [],
            simulateRecoveryByFederation: {},
        },
        environment: {
            onboardingMethod,
            featureFlags: {
                personal_backup_reminder: featureEnabled ? {} : null,
            },
        },
        nux: {
            steps: {
                hasPerformedPersonalBackup,
            },
        },
        personalBackupReminder: {
            countdownStartedAt,
            dismissedThisSession,
            hasReachedThresholds: hasReachedBackupReminderThreshold,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

describe('selectShouldShowBackupReminder', () => {
    it('should show when aggregate stored value reaches the threshold', () => {
        const store = buildStore({ balanceSats: 210 })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(true)
    })

    it('should not show when the feature flag is disabled, even above threshold', () => {
        const store = buildStore({ balanceSats: 1000, featureEnabled: false })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(false)
    })

    it('should not show just below the threshold', () => {
        const store = buildStore({ balanceSats: 209 })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(false)
    })

    it('should not show once the user has backed up, even above threshold', () => {
        const store = buildStore({
            balanceSats: 1000,
            hasPerformedPersonalBackup: true,
        })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(false)
    })

    it('should not show for restored accounts, even above threshold', () => {
        const store = buildStore({
            balanceSats: 1000,
            onboardingMethod: 'restored',
        })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(false)
    })

    it('should not show while onboarding method is unresolved (null), even above threshold', () => {
        const store = buildStore({
            balanceSats: 1000,
            onboardingMethod: null,
        })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(false)
    })

    it('should stay shown once the threshold has been reached, even after spend-down', () => {
        const store = buildStore({
            balanceSats: 0,
            hasReachedBackupReminderThreshold: true,
        })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(true)
    })

    it('should show when the countdown has elapsed below threshold', () => {
        const store = buildStore({
            balanceSats: 0,
            countdownStartedAt: Date.now() - BACKUP_REMINDER_ELAPSED_MS - 1000,
        })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(true)
    })

    it('should not show when the countdown has not elapsed below threshold', () => {
        const store = buildStore({
            balanceSats: 0,
            countdownStartedAt: Date.now(),
        })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(false)
    })

    it('should not show once dismissed for the session, even above threshold', () => {
        const store = buildStore({
            balanceSats: 1000,
            dismissedThisSession: true,
        })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(false)
    })

    it('should not show when dismissed for the session, even once the threshold has latched', () => {
        const store = buildStore({
            hasReachedBackupReminderThreshold: true,
            dismissedThisSession: true,
        })
        expect(selectShouldShowBackupReminder(store.getState())).toBe(false)
    })
})
