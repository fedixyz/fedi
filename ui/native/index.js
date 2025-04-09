/**
 * @format
 */
import notifee, { AndroidImportance } from '@notifee/react-native'
import messaging from '@react-native-firebase/messaging'
import {
    AppRegistry,
    AppState,
    NativeEventEmitter,
    NativeModules,
} from 'react-native'
import 'react-native-gesture-handler'
import 'react-native-get-random-values'
import { install } from 'react-native-quick-crypto'
import 'react-native-reanimated'
import 'react-native-url-polyfill/auto'
import * as Zendesk from 'react-native-zendesk-messaging'
import { v4 as uuidv4 } from 'uuid'

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
    getNotificationBackgroundColor,
    dispatchNotification,
} from './utils/notifications'
import { storage } from './utils/storage'
import {
    launchZendeskSupport,
    zendeskCloseMessagingView,
} from './utils/support'

const { PushNotificationEmitter } = NativeModules
const log = makeLog('native/index')

const initializePushNotificationListeners = () => {
    ///////////////////////////////
    //Initalise Push Notification Listeners
    ///////////////////////////////

    messaging().onMessage(async m => {
        await handleFCMNotification(m, true) // isForeground = true
    })

    // Dispatches FCM notifications when app is closed
    messaging().setBackgroundMessageHandler(async m => {
        await handleFCMNotification(m, false) // isForeground = false
    })

    //ios only - handles direct ios push notification events - currently taps, but can hook in to anything. Used for support SDK currently
    if (PushNotificationEmitter) {
        const eventEmitter = new NativeEventEmitter(PushNotificationEmitter)

        eventEmitter.addListener(
            'PushNotificationTapped',
            notificationPayload => {
                if (notificationPayload?.SmoochNotification !== undefined) {
                    zendeskCloseMessagingView()
                    launchZendeskSupport(() => {
                        log.error('Error', 'Failed to open Zendesk Support.')
                    })
                    return
                }
            },
        )
    }

    // Handles updates to notification (delivered, user taps notification, actions, etc)
    // Runs in headless js, so we don't have access to the UI or clients.
    // However, we can make api calls or access offline resources.
    notifee.onBackgroundEvent(e => handleBackgroundNotificationUpdate(e))

    // Create a channel (required for Android) - for all notifications
    notifee.createChannel({
        id: 'and-notification-channel',
        name: 'Android Notification Channel',
        importance: AndroidImportance.HIGH,
        sound: 'default',
    })
}

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

async function handleFCMNotification(m, isForeground = true) {
    log.info(
        `${isForeground ? 'Foreground' : 'Background'} FCM message received:`,
        m,
    )

    try {
        const responsibility = await Zendesk.handleNotification(m.data)
        log.info('ZendeskResponsibility', responsibility)
        switch (responsibility) {
            case 'MESSAGING_SHOULD_DISPLAY': {
                log.info('Zendesk notification message detected.')

                const uniqueId = `zendesk-${uuidv4()}`

                const rawMessage = m.data?.message
                log.debug('Raw Zendesk message:', rawMessage)

                const { senderName, messageText } =
                    await parseZendeskNotification(rawMessage)

                await dispatchNotification(
                    uniqueId,
                    'and-notification-channel',
                    senderName,
                    messageText,
                    {
                        type: 'zendesk',
                        data: m.data,
                    },
                    {
                        android: {
                            pressAction: {
                                id: uniqueId,
                                launchActivity: 'default',
                            },
                            autoCancel: true,
                            onlyAlertOnce: false,
                            smallIcon: 'ic_stat_notification',
                            color: getNotificationBackgroundColor(),
                        },
                        ios: {
                            foregroundPresentationOptions: {
                                alert: true,
                                badge: true,
                                sound: true,
                            },
                            sound: 'default',
                        },
                    },
                )

                return
            }
            case 'MESSAGING_SHOULD_NOT_DISPLAY': {
                log.info('Notification handled by Zendesk, not displaying.')
                return
            }
            case 'NOT_FROM_MESSAGING': {
                break
            }
            default: {
                log.info(
                    'Notification not handled by Zendesk, forwarding to custom handler.',
                )
            }
        }

        if (isForeground) {
            handleForegroundFCMReceived(m)
        } else {
            handleBackgroundFCMReceived(m, i18next.t)
        }
    } catch (error) {
        log.error(
            `Error handling ${isForeground ? 'foreground' : 'background'} notification with Zendesk:`,
            error,
        )
    }
}

//startup code
install()
initializePushNotificationListeners()
//end startup code
// Register the app component
AppRegistry.registerComponent(appName, () => App)

// Configure logging to use native storage, and to save logs before close.
configureLogging(storage)
AppState.addEventListener('change', state => {
    if (state === 'background' || state === 'inactive') {
        saveLogsToStorage()
    }
})
