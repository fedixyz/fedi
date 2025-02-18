/**
 * @format
 */
import notifee from '@notifee/react-native'
import messaging from '@react-native-firebase/messaging'
import { AppRegistry, AppState } from 'react-native'
import 'react-native-gesture-handler'
import 'react-native-get-random-values'
import { install } from 'react-native-quick-crypto'
import 'react-native-reanimated'
import 'react-native-url-polyfill/auto'
import * as Zendesk from 'react-native-zendesk-messaging'

import {
    configureLogging,
    saveLogsToStorage,
    makeLog,
} from '@fedi/common/utils/log'

import App from './App'
import { name as appName } from './app.json'
import i18next from './localization/i18n'
import {
    handleBackgroundFCMReceived,
    handleBackgroundNotificationUpdate,
    handleForegroundFCMReceived,
} from './utils/notifications'
import { storage } from './utils/storage'

const log = makeLog('native/index')
install()

// Handles FCM notifications when app is open
async function handleFCMNotification(m, isForeground = true) {
    log.info(
        `${isForeground ? 'Foreground' : 'Background'} FCM message received:`,
        m,
    )

    try {
        // Delegate to Zendesk SDK
        const responsibility = await Zendesk.handleNotification(m.data)

        switch (responsibility) {
            case 'MESSAGING_SHOULD_DISPLAY':
            case 'MESSAGING_SHOULD_NOT_DISPLAY':
                // Notification handled by Zendesk SDK, no further action needed
                return

            case 'NOT_FROM_MESSAGING':
            default:
                log.info(
                    'Notification not handled by Zendesk, forwarding to custom handler.',
                )
                break
        }
    } catch (error) {
        log.error(
            `Error handling ${isForeground ? 'foreground' : 'background'} notification with Zendesk:`,
            error,
        )
    }

    // Handle non-Zendesk notifications or additional actions
    if (isForeground) {
        handleForegroundFCMReceived(m)
    } else {
        handleBackgroundFCMReceived(m, i18next.t)
    }
}

messaging().onMessage(async m => {
    await handleFCMNotification(m, true) // isForeground = true
})

// Dispatches FCM notifications when app is closed
messaging().setBackgroundMessageHandler(async m => {
    await handleFCMNotification(m, false) // isForeground = false
})

// Handles updates to notification (delivered, user taps notification, actions, etc)
// Runs in headless js, so we don't have access to the UI or clients.
// However, we can make api calls or access offline resources.
notifee.onBackgroundEvent(e => handleBackgroundNotificationUpdate(e))

// Register the app component
AppRegistry.registerComponent(appName, () => App)

// Configure logging to use native storage, and to save logs before close.
configureLogging(storage)
AppState.addEventListener('change', state => {
    if (state === 'background' || state === 'inactive') {
        saveLogsToStorage()
    }
})
