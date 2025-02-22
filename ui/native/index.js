/**
 * @format
 */
import notifee, { AndroidImportance } from '@notifee/react-native'
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

const parseZendeskNotification = async rawMessage => {
    let senderName = 'Unknown Sender'
    let messageText = 'No message text'

    try {
        // Ensure rawMessage exists and is a string before parsing
        if (
            typeof rawMessage === 'string' &&
            rawMessage.trim().startsWith('{')
        ) {
            const parsedMessage = JSON.parse(rawMessage)
            senderName = parsedMessage?.name || senderName
            messageText = parsedMessage?.text || messageText
        } else if (typeof rawMessage === 'object') {
            // If rawMessage is already an object, use it directly
            senderName = rawMessage?.name || senderName
            messageText = rawMessage?.text || messageText
        } else {
            log.warn('Unexpected message format:', rawMessage)
        }

        return { senderName, messageText }
    } catch (error) {
        log.error(
            'Error parsing Zendesk message JSON:',
            error,
            'Raw message:',
            rawMessage,
        )
    }
}

// Handles FCM notifications when app is open
async function handleFCMNotification(m, isForeground = true) {
    log.info(
        `${isForeground ? 'Foreground' : 'Background'} FCM message received:`,
        m,
    )

    try {
        // Delegate to Zendesk SDK
        const responsibility = await Zendesk.handleNotification(m.data)
        log.debug('ZendeskResponsibility', responsibility)
        switch (responsibility) {
            case 'MESSAGING_SHOULD_DISPLAY': {
                log.info(
                    'Zendesk message detected. Manually displaying notification.',
                )
                const notificationId = m.messageId || 'zendesk-message'

                //get the data
                const rawMessage = m.data?.message

                log.debug('Raw Zendesk message:', rawMessage) // <-- Log the raw value

                // Parse the raw message into senderName and messageText
                const { senderName, messageText } =
                    await parseZendeskNotification(rawMessage)

                notifee.cancelNotification(notificationId) // Cancel any existing notification

                const notificationPayload = {
                    id: notificationId, // Must match for replacement
                    title: senderName,
                    body: messageText,
                    data: m.data,
                    android: {
                        channelId: 'zendesk-channel', // Android needs a channel Id which we set up earlier
                        pressAction: {
                            id: 'zendesk-message',
                            launchActivity: 'default',
                        },
                        autoCancel: true,
                        onlyAlertOnce: true,
                        smallIcon: 'ic_stat_notification',
                    },
                    ios: {
                        foregroundPresentationOptions: {
                            alert: true,
                            badge: true,
                            sound: true, // Play sound on iOS
                        },
                        categoryId: 'zendesk-chat', // iOS notification category
                    },
                }

                // Display the notification on both platforms
                await notifee.displayNotification(notificationPayload)
                return
            }

            case 'MESSAGING_SHOULD_NOT_DISPLAY': {
                log.info('Notification handled by Zendesk, not displaying.')
                return
            }
            case 'NOT_FROM_MESSAGING':
            default: {
                log.info(
                    'Notification not handled by Zendesk, forwarding to custom handler.',
                )
                // Handle non-Zendesk notifications or additional actions
                if (isForeground) {
                    handleForegroundFCMReceived(m)
                } else {
                    handleBackgroundFCMReceived(m, i18next.t)
                }
            }
        }
    } catch (error) {
        log.error(
            `Error handling ${isForeground ? 'foreground' : 'background'} notification with Zendesk:`,
            error,
        )
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

//need this channel for Zendesk deeplinking
notifee.createChannel({
    id: 'zendesk-channel',
    name: 'Zendesk Support Messages',
    importance: AndroidImportance.HIGH,
    sound: 'default',
})

// Register the app component
AppRegistry.registerComponent(appName, () => App)

// Configure logging to use native storage, and to save logs before close.
configureLogging(storage)
AppState.addEventListener('change', state => {
    if (state === 'background' || state === 'inactive') {
        saveLogsToStorage()
    }
})
