import notifee, {
    Event,
    EventType,
    NotificationAndroid,
    type NotificationIOS,
    AndroidGroupAlertBehavior,
    Notification,
} from '@notifee/react-native'
import messaging, {
    FirebaseMessagingTypes,
} from '@react-native-firebase/messaging'
import { TFunction } from 'i18next'
import { ResultAsync } from 'neverthrow'
import { Appearance, Linking, Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import * as Zendesk from 'react-native-zendesk-messaging'
import { v4 as uuidv4 } from 'uuid'

import { theme } from '@fedi/common/constants/theme'
import {
    selectFederations,
    configureMatrixPushNotifications,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { TaggedError } from '@fedi/common/utils/errors'
import { FedimintBridge } from '@fedi/common/utils/fedimint'
import { makeLog } from '@fedi/common/utils/log'
import { encodeFediMatrixRoomUri } from '@fedi/common/utils/matrix'
import { getTxnDirection } from '@fedi/common/utils/transaction'

import { store, AppDispatch } from '../state/store'
import {
    TransactionDirection,
    TransactionEvent,
    TransactionListEntry,
} from '../types'
import { launchZendeskSupport, zendeskCloseMessagingView } from './support'

const log = makeLog('Notifications')

export const NOTIFICATION_TYPES = [
    'chat',
    'payment',
    'announcement',
    'zendesk',
] as const
export type NOTIFICATION_TYPE = (typeof NOTIFICATION_TYPES)[number]

/** One Android notification-group (a “stack”) per business type */
export const GROUP_IDS: Record<NOTIFICATION_TYPE, string> = {
    chat: 'group-chat',
    payment: 'group-payment',
    announcement: 'group-announcement',
    zendesk: 'group-zendesk',
}

export const manuallyPublishNotificationToken = async (
    supportPermissionGranted: boolean,
    fedimint: FedimintBridge,
) => {
    log.info('Manually publishing push notification token...')

    try {
        const dispatch: AppDispatch = store.dispatch // Explicit dispatch type

        // Check and request permissions
        const permissionStatus = await messaging().hasPermission()
        if (permissionStatus !== messaging.AuthorizationStatus.AUTHORIZED) {
            log.warn(
                'Notification permission not granted. Requesting permission...',
            )
            await messaging().requestPermission()
        }

        // Fetch the FCM token
        const fcmToken = await messaging().getToken()
        if (!fcmToken) throw new Error("FCM Token couldn't be fetched.")
        log.info(`Fetched FCM Token: ${fcmToken}`)

        // 1. **Publish to Sygnal (Matrix push notification server)**
        try {
            await dispatch(
                configureMatrixPushNotifications({
                    fedimint,
                    token: fcmToken,
                    appId: DeviceInfo.getBundleId(),
                    appName: DeviceInfo.getApplicationName(),
                }),
            ).unwrap() // Unwrap the Promise to catch Redux rejections

            log.info(
                'Successfully published Matrix (Sygnal) push notification token.',
            )
        } catch (err) {
            log.error('Failed to publish Matrix push notification token:', err)
        }

        // 2. **Publish to Zendesk**
        if (supportPermissionGranted) {
            try {
                await Zendesk.updatePushNotificationToken(fcmToken)
                log.info(
                    'Successfully published Zendesk push notification token.',
                )
            } catch (err) {
                log.error(
                    'Failed to publish Zendesk push notification token:',
                    err,
                )
            }
        }
    } catch (error) {
        log.error('Failed to manually publish notification token:', error)
    }
}

/** Handles Firebase Messages when app is in foreground */
export const handleForegroundFCMReceived = async (
    message: FirebaseMessagingTypes.RemoteMessage,
) => {
    // Ignore chat notifications if app is in foreground
    if (message?.data?.unread)
        return log.info('foreground FCM notification received (no-op)', message)

    // Any other FCM notification should be a campaign message, so
    // it should have a notification property
    if (!message.notification)
        return log.warn(
            'invalid FCM notification received (no-op)',
            JSON.stringify(message),
        )

    log.info('foreground Campaign notification received', message)
    await displayAnnouncement(message)
}

/**
 * Handles Firebase Messages when app is in background.
 * Passes FCM notification (chat) to notifee for presentation.
 */
export const handleBackgroundFCMReceived = async (
    message: FirebaseMessagingTypes.RemoteMessage,
    t: TFunction,
) => {
    log.info('background FCM notification received', message.data)
    await displayMessageReceivedNotification(message.data, t)
}

/** Displays Payment Notifications */
export const displayPaymentReceivedNotification = async (
    event: TransactionEvent,
    t: TFunction,
): Promise<void> => {
    let transaction: TransactionListEntry | undefined

    if (typeof event.transaction === 'object' && event.transaction !== null) {
        transaction = event.transaction as TransactionListEntry
    }

    if (!transaction) return

    const direction = getTxnDirection(transaction)

    // Skip outbound payments
    if (direction !== TransactionDirection.receive) return

    // Skip on-chain transactions until claimed
    if (
        transaction.kind === 'onchainDeposit' &&
        transaction.state?.type !== 'claimed'
    )
        return

    // Skip ecash transactions until done
    if (transaction.kind === 'oobReceive' && transaction.state?.type !== 'done')
        return

    const federations = selectFederations(store.getState())
    const federation = federations.find(f => f.id === event.federationId)
    const federationName = federation?.name

    const amountText = amountUtils.formatNumber(
        amountUtils.msatToSat(transaction.amount),
    )

    const title = federationName
        ? `${federationName}: ${t('phrases.payment-received')}`
        : t('phrases.payment-received')

    const body = `${amountText} ${t('words.sats')}`

    const uniqueId = `payment-${uuidv4()}`

    await dispatchNotification(
        uniqueId,
        'and-notification-channel',
        title,
        body,
        {
            link: '',
            type: 'payment',
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
            },
        },
    )
}

export const displayMessageReceivedNotification = async (
    // TODO: make stronger type for this
    data: FirebaseMessagingTypes.RemoteMessage['data'],
    t: TFunction,
) => {
    if (!data?.room_id) return null

    /*
     * TODO:
     * 1. Get room info
     * 2. Get message info (including sender)
     * 3. Group notification channels by room ID
     */

    const title = t('words.chat')
    // TODO: for some reason data.unread is not returning >1 even on subsequent
    // sent messages so it is just confusing to show "You have 1 new message"
    // when really there could be more. Just make it generic for now
    const body = t('feature.notifications.new-messages')
    const link = encodeFediMatrixRoomUri(data.room_id as string, true)

    const uniqueId = `chat-${uuidv4()}`

    await dispatchNotification(
        uniqueId,
        'and-notification-channel',
        title,
        body,
        {
            type: 'chat',
            link,
            data,
        },
        {
            android: {
                pressAction: {
                    id: uniqueId,
                    launchActivity: 'default',
                },
            },
            ios: {
                foregroundPresentationOptions: {
                    alert: true,
                    badge: true,
                    sound: true,
                },
            },
        },
    )
}

type NotificationData = {
    // Deep link to open application when pressed
    link?: string

    // Type of notification, determines what to present to user
    type?: NOTIFICATION_TYPE

    // todo: type inner data?
    data?: Record<string, unknown>
}
export const getNotificationBackgroundColor = () => {
    const colorScheme = Appearance.getColorScheme() // 'light' | 'dark' | null

    return colorScheme === 'dark' ? theme.colors.white : theme.colors.black
}

/**
 * Displays Announcement Notifications
 */
export const displayAnnouncement = async (
    message: FirebaseMessagingTypes.RemoteMessage,
) => {
    if (!message?.notification?.title || !message?.notification?.body) {
        return log.warn(
            'Malformed announcement notification received:',
            message,
        )
    }

    const title = message.notification.title
    const body = message.notification.body
    const uniqueId = `announcement-${uuidv4()}`

    await dispatchNotification(
        uniqueId,
        'and-notification-channel',
        title,
        body,
        {
            type: 'announcement',
            data: message.data,
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
}

export const dispatchNotification = async (
    id: string,
    channelId: string,
    title: string,
    body: string,
    data: NotificationData,
    params: { android?: NotificationAndroid; ios?: NotificationIOS } = {},
): Promise<void> => {
    const result = await ResultAsync.fromPromise(
        (async () => {
            log.debug('dispatchNotification', {
                id,
                channelId,
                type: data.type,
            })

            await notifee.incrementBadgeCount()
            const currentBadgeCount = await notifee.getBadgeCount()
            log.debug('notification badge-count', currentBadgeCount)

            // optional group id (android only)
            const groupId = data.type ? GROUP_IDS[data.type] : undefined

            if (Platform.OS === 'android') {
                const androidParams: NotificationAndroid = {
                    channelId,
                    badgeCount: currentBadgeCount,
                    pressAction: {
                        id,
                        launchActivity: 'default',
                        ...params.android?.pressAction,
                    },
                    autoCancel: true,
                    onlyAlertOnce: false,
                    smallIcon: 'ic_stat_notification',
                    color: getNotificationBackgroundColor(),
                    ...(groupId
                        ? {
                              groupId,
                              groupAlertBehavior:
                                  AndroidGroupAlertBehavior.SUMMARY,
                          }
                        : {}),
                    ...params.android,
                }

                // child notification
                await notifee.displayNotification({
                    id,
                    title,
                    body,
                    data,
                    android: androidParams,
                })
                log.info('displayed notification (android child)', id)

                // summary notification
                if (groupId) {
                    await notifee.displayNotification({
                        id: `${groupId}-summary`,
                        title,
                        body,
                        android: {
                            channelId,
                            groupId,
                            groupSummary: true,
                            smallIcon: 'ic_stat_notification',
                            color: getNotificationBackgroundColor(),
                            groupAlertBehavior:
                                AndroidGroupAlertBehavior.SUMMARY,
                            pressAction: {
                                id: 'default',
                                launchActivity: 'default',
                            },
                        },
                    })
                    log.info(
                        'updated notification summary',
                        `${groupId}-summary`,
                    )
                }
            } else {
                await notifee.displayNotification({
                    id,
                    title,
                    body,
                    data,
                    ios: {
                        ...params.ios,
                        badgeCount: currentBadgeCount,
                        sound: 'default',
                        foregroundPresentationOptions: {
                            alert: true,
                            badge: true,
                            sound: true,
                        },
                    },
                })
                log.info('displayed notification (ios)', id)
            }

            log.info(`badge count ${currentBadgeCount}`)
        })(),
        e => new TaggedError('GenericError', e),
    )

    if (result.isErr()) {
        log.error('Failed to display notification', result.error)
        return
    }
}

/**
 * A replacement for the unreliable 'Zendesk.handleNotification(data' that detects whether a notification payload is from zendesk or not
 **/
export async function isZendeskNotification(
    data: Notification['data'],
): Promise<boolean> {
    if (!data) return false

    try {
        // Convert the entire payload to a lowercase string and check for 'smoochnotification' so we can tell if it's from Zendesk or not
        const dataString = JSON.stringify(data).toLowerCase()

        if (dataString.includes('smoochnotification')) {
            log.debug(
                'Zendesk notification detected via manual check in isZendeskNotification',
            )
            return true
        }

        log.debug(
            'isZendeskNotification detected the push notificaiton payload was not a Zendesk notification',
        )
        return false
    } catch (error) {
        log.error('Error checking Zendesk notification payload:', error)
        return false
    }
}

/**
 * Decrements the badge count by 1, ensuring it doesn't go below zero.
 */
const decrementBadgeCountSafely = async () => {
    try {
        const currentBadgeCount = await notifee.getBadgeCount()

        if (currentBadgeCount > 0) {
            const updatedBadgeCount = currentBadgeCount - 1
            await notifee.setBadgeCount(updatedBadgeCount)
            log.info(`Badge count decremented to: ${updatedBadgeCount}`)
        } else {
            log.info('Badge count is already at zero, no decrement needed.')
        }
    } catch (error) {
        log.error('Failed to decrement badge count:', error)
    }
}

// Handles user interaction with notifications
// TODO: when we add quick actions, incorporate deep linking here
export const handleBackgroundNotificationUpdate = async ({
    type,
    detail,
}: Event) => {
    if (type === EventType.DISMISSED || type === EventType.PRESS) {
        await decrementBadgeCountSafely()
    }

    if (type === EventType.PRESS) {
        const isZendesk = await isZendeskNotification(
            detail?.notification?.data,
        )

        if (isZendesk) {
            await zendeskCloseMessagingView()
            await launchZendeskSupport(error =>
                log.error('Zendesk error:', error),
            )
            return
        }

        const link = detail?.notification?.data?.link
        if (typeof link === 'string') {
            Linking.openURL(link)
        }
    } else if (type === EventType.ACTION_PRESS) {
        log.info('notification event (action pressed)', detail)
        // TODO: Handle quick actions if needed
    } else if (type === EventType.DELIVERED) {
        log.info('notification event (delivered)', detail)
        // TODO: Redeem ecash if applicable
    }
}
