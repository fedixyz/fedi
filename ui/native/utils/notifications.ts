import notifee, {
    AndroidImportance,
    AndroidVisibility,
    Event,
    EventType,
    NotificationAndroid,
    NotificationIOS,
} from '@notifee/react-native'
import messaging, {
    FirebaseMessagingTypes,
} from '@react-native-firebase/messaging'
import { TFunction } from 'i18next'
import { Linking } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import * as Zendesk from 'react-native-zendesk-messaging'

import {
    selectFederations,
    configureMatrixPushNotifications,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'
import { encodeFediMatrixRoomUri } from '@fedi/common/utils/matrix'

import { store, AppDispatch } from '../state/store'
import { TransactionDirection, TransactionEvent } from '../types'

const log = makeLog('Notifications')

export const NOTIFICATION_TYPES = ['chat', 'payment'] as const
export type NOTIFICATION_TYPE = (typeof NOTIFICATION_TYPES)[number]

export const manuallyPublishNotificationToken = async () => {
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
        try {
            await Zendesk.updatePushNotificationToken(fcmToken)
            log.info('Successfully published Zendesk push notification token.')
        } catch (err) {
            log.error('Failed to publish Zendesk push notification token:', err)
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
) => {
    const { direction, amount, onchainState, oobState } = event.transaction

    // Don't show notification for outbound payment
    if (direction !== TransactionDirection.receive) return

    // Don't show notification for onchain txn until it is claimed
    if (onchainState && onchainState.type !== 'claimed') return
    // Don't show notification for ecash txn until it is done
    if (oobState && oobState.type !== 'done') return

    const federations = selectFederations(store.getState())
    const federation = federations.find(f => f.id === event.federationId)
    const federationName = federation?.name

    const amountText = amountUtils.formatNumber(amountUtils.msatToSat(amount))
    await dispatchNotification(
        'transaction',
        'Transactions Channel',
        federationName
            ? `${federationName}: ${t('phrases.payment-received')}`
            : t('phrases.payment-received'),
        `${amountText} ${t('words.sats')}`,
        {
            link: '',
            type: 'payment',
        },
    )
}

/** Displays Chat Notifications */
export const displayMessageReceivedNotification = async (
    // data: FirebaseMessagingTypes.RemoteMessage,
    // todo: get type from bridge
    data: any, // extends MatrixChatEvent,
    t: TFunction,
) => {
    if (!data.room_id) return null // throw error?

    /*
     * TOOD:
     * 1. Get room info
     * 2. Get message info (including sender)
     * 3. Group notification channels by room ID
     */
    const title = t('words.chat')
    // TODO: for some reason data.unread is not returning >1 even on subsequent
    // sent messages so it is just confusing to show "You have 1 new message"
    // when really there could be more. Just make it generic for now
    const body = t('feature.notifications.new-messages')
    // const body = data?.unread
    //     ? t('feature.notifications.new-messages-count', {
    //           unread: data.unread,
    //       })
    //     : t('feature.notifications.new-messages')

    const link = encodeFediMatrixRoomUri(data.room_id, true)

    await dispatchNotification(
        'chat-message-received',
        'Chat channel',
        title,
        body,
        {
            type: 'chat',
            link,
            data,
        },
        {
            android: {
                groupSummary: true,
                // TODO: group notifications by chat room? for now it will confuse users since room name is not included but we should be able to fetch the name and group by room ID
                // groupId: data.room_id,
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
    data?: any
}

/**
 * Handles Bespoke Firebase Messaging Campaigns
 */
export const displayAnnouncement = async (
    message: FirebaseMessagingTypes.RemoteMessage,
) => {
    const id = 'announcement'
    const channelName = 'Fedi Announcements'
    const title = message?.notification?.title
    const body = message?.notification?.body

    // Announcements must have a title & body
    if (!title || !body)
        return log.warn(
            'Malformed Announcement notification received (no-op)',
            message,
        )

    const android: NotificationAndroid = {
        ...message?.notification?.android,

        // override visibility to public
        visibility: AndroidVisibility.PUBLIC,
        importance: AndroidImportance.HIGH,
    }

    const ios = {
        ...message?.notification?.ios,
        // Fixes type incompatibility between FCM and
        // notifee for "sound" property
        // `Type 'NotificationIOSCriticalSound' is not assignable to type 'string'.`
    } as NotificationIOS

    await dispatchNotification(
        id,
        channelName,
        title,
        body,
        {},
        { android, ios },
    )
}

/**
 * Shows a push notification
 *
 * @param id for Android notification channel
 * @param channelName for Android notification channel
 * @param title Bold notification title
 * @param body Long subtext for notification
 * @param data context for notification
 * @param params platform-specific information for notification
 */
const dispatchNotification = async (
    id: string,
    channelName: string,
    title: string,
    body: string,
    data: NotificationData,
    params: {
        android?: NotificationAndroid
        ios?: NotificationIOS
    } = {},
) => {
    // Request permissions (required for iOS)
    // await notifee.requestPermission()

    // Create a channel (required for Android)
    const channelId = await notifee.createChannel({
        id,
        name: channelName,
    })
    const androidParams = {
        channelId,
        // Default open the app when pressed
        // (required for android)
        pressAction: {
            id,
            launchActivity: 'default',
            ...params.android?.pressAction,
        },
        ...params.android,
    }
    try {
        await notifee.displayNotification({
            id,
            title,
            body,
            data,
            android: androidParams,
            ios: params.ios,
        })
        // ios
        await notifee.incrementBadgeCount()
    } catch (e) {
        log.error('Failed to display notification', e)
    }
}

// Handles user interaction with notifications
// TODO: when we add quick actions, incorporate deep linking here
export const handleBackgroundNotificationUpdate = async ({
    type,
    detail,
}: Event) => {
    if (type === EventType.ACTION_PRESS) {
        log.info('notification event (action pressed)', detail)
        // TODO: reply? accept/reject? etc?
    } else if (type === EventType.DELIVERED) {
        log.info('notification event (delivered)', detail)
        // TODO: redeem ecash?
    } else if (type === EventType.DISMISSED) {
        log.info('notification event (dismissed)', detail)
        // TODO: dismiss unread indicator?
    } else if (type === EventType.PRESS) {
        log.info('notification event (pressed)', JSON.stringify(detail))
        const link = detail?.notification?.data?.link
        if (typeof link === 'string') Linking.openURL(link)
    }
}
