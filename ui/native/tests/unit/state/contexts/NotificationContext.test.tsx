import { act, cleanup, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Alert, Linking, Text } from 'react-native'
import {
    checkNotifications,
    requestNotifications,
} from 'react-native-permissions'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    setupStore,
} from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import i18n from '@fedi/native/localization/i18n'

import {
    NotificationContextProvider,
    useNotificationContext,
} from '../../../../state/contexts/NotificationContext'
import { manuallyPublishNotificationToken } from '../../../../utils/notifications'
import { renderWithProviders } from '../../../utils/render'

jest.mock('../../../../state/hooks', () => ({
    useMatrixPushNotifications: jest.fn(),
}))

jest.mock('../../../../utils/hooks/support', () => ({
    useUpdateZendeskNotificationCount: jest.fn(),
}))

jest.mock('../../../../utils/notifications', () => ({
    manuallyPublishNotificationToken: jest.fn(() => Promise.resolve()),
}))

const mockCheck = jest.mocked(checkNotifications)
const mockRequest = jest.mocked(requestNotifications)
const mockPublishToken = jest.mocked(manuallyPublishNotificationToken)

const Probe = () => {
    const { isNotificationEnabled } = useNotificationContext()
    return (
        <Text testID="notifications-enabled">
            {String(isNotificationEnabled)}
        </Text>
    )
}

function seedChat(store: ReturnType<typeof setupStore>, id = '1') {
    act(() => {
        store.dispatch(addMatrixRoomInfo({ ...MOCK_MATRIX_ROOM, id }))
        store.dispatch(
            handleMatrixRoomListStreamUpdates([
                { Append: { values: [{ status: 'ready' as const, id }] } },
            ]),
        )
    })
}

describe('NotificationContextProvider', () => {
    let store: ReturnType<typeof setupStore>
    let alertSpy: jest.SpyInstance
    let openSettingsSpy: jest.SpyInstance

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
        alertSpy = jest.spyOn(Alert, 'alert')
        Linking.openSettings = jest.fn(() => Promise.resolve())
        openSettingsSpy = jest.spyOn(Linking, 'openSettings')
    })

    afterEach(() => {
        cleanup()
    })

    const renderProvider = () =>
        renderWithProviders(
            <NotificationContextProvider>
                <Probe />
            </NotificationContextProvider>,
            { store },
        )

    it('should leave the OS prompt alone until the user has a chat', async () => {
        mockCheck.mockResolvedValue({ status: 'denied', settings: {} })
        mockRequest.mockResolvedValue({ status: 'granted', settings: {} })

        renderProvider()

        await waitFor(() => expect(mockCheck).toHaveBeenCalled())
        expect(mockRequest).not.toHaveBeenCalled()

        seedChat(store)

        await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1))
    })

    it('should publish the push token once the user allows', async () => {
        mockCheck.mockResolvedValue({ status: 'denied', settings: {} })
        mockRequest.mockResolvedValue({ status: 'granted', settings: {} })

        renderProvider()
        seedChat(store)

        await waitFor(() => expect(mockPublishToken).toHaveBeenCalled())
        expect(screen.getByTestId('notifications-enabled')).toHaveTextContent(
            'true',
        )
    })

    it('should not stack OS requests while the prompt is unanswered', async () => {
        mockCheck.mockResolvedValue({ status: 'denied', settings: {} })
        let resolveRequest!: (value: {
            status: 'granted'
            settings: Record<string, never>
        }) => void
        mockRequest.mockImplementation(
            () =>
                new Promise(resolve => {
                    resolveRequest = resolve
                }),
        )

        renderProvider()
        seedChat(store)
        await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1))

        seedChat(store, '2')
        await act(async () => Promise.resolve())
        expect(mockRequest).toHaveBeenCalledTimes(1)

        await act(async () =>
            resolveRequest({ status: 'granted', settings: {} }),
        )
    })

    it('should offer Settings once when the user declines the prompt', async () => {
        mockCheck.mockResolvedValue({ status: 'denied', settings: {} })
        mockRequest.mockResolvedValue({ status: 'blocked', settings: {} })

        renderProvider()
        seedChat(store)

        await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
        const [title, , buttons] = alertSpy.mock.calls[0]
        expect(title).toBe(
            i18n.t('feature.permissions.notifications-off-title'),
        )
        expect(openSettingsSpy).not.toHaveBeenCalled()

        const settingsButton = buttons?.find(
            (button: { text: string }) =>
                button.text === i18n.t('phrases.open-settings'),
        )
        act(() => {
            settingsButton?.onPress()
        })
        expect(openSettingsSpy).toHaveBeenCalledTimes(1)

        seedChat(store, '2')
        await act(async () => Promise.resolve())
        expect(mockRequest).toHaveBeenCalledTimes(1)
        expect(alertSpy).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('notifications-enabled')).toHaveTextContent(
            'false',
        )
    })

    it('should leave already-declined users alone', async () => {
        mockCheck.mockResolvedValue({ status: 'blocked', settings: {} })

        renderProvider()
        seedChat(store)

        await waitFor(() => expect(mockCheck).toHaveBeenCalled())
        await act(async () => Promise.resolve())
        expect(mockRequest).not.toHaveBeenCalled()
        expect(alertSpy).not.toHaveBeenCalled()
    })
})
