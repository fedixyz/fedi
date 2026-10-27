import { formationAt, formationStatus } from '../status'
import {
    FaScript,
    checkpoint,
    formWalletService,
    script,
    stream,
    stub,
} from '../steps'

/**
 * Guardians on a release without auto join refuse the change: the bridge
 * reports `maintenanceRejected` and says why in the detail.
 */
export const settingsAutojoinUnsupported: FaScript = script(
    'settings.autojoinUnsupported',
    [
        stream(ctx => formationStatus(formationAt(ctx, 'formed'))),
        formWalletService('ready'),
        stub('faClientUpdateFederationMetadata', () => ({
            type: 'error',
            error: {
                code: 'maintenanceRejected',
                message: 'simulated guardians without auto join support',
                detail: { type: 'maintenanceUnsupported' },
            },
        })),
        checkpoint('autojoin'),
    ],
)

export const SETTINGS_SCRIPTS: FaScript[] = [settingsAutojoinUnsupported]
