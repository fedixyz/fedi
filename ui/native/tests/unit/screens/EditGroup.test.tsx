import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    setupStore,
} from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import i18n from '@fedi/native/localization/i18n'

import EditGroup from '../../../screens/EditGroup'
import { MatrixRoomListItem } from '../../../types'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

describe('EditGroup screen', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()

    beforeEach(() => {
        store = setupStore()

        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should not allow a group name with >=30 characters', async () => {
        store.dispatch(
            handleMatrixRoomListStreamUpdates([
                {
                    Append: {
                        values: [
                            {
                                status: 'ready',
                                id: MOCK_MATRIX_ROOM.id,
                            } as MatrixRoomListItem,
                        ],
                    },
                },
            ]),
        )
        store.dispatch(addMatrixRoomInfo(MOCK_MATRIX_ROOM))
        renderWithProviders(
            <EditGroup
                navigation={mockNavigation as any}
                route={{
                    ...mockRoute,
                    key: 'EditGroup',
                    name: 'EditGroup',
                    params: {
                        roomId: MOCK_MATRIX_ROOM.id,
                    },
                }}
            />,
            {
                store,
            },
        )

        const label = screen.getByText(i18n.t('feature.chat.group-name'))
        expect(label).toBeOnTheScreen()
        const input = screen.getByPlaceholderText(
            i18n.t('feature.chat.group-name'),
        )
        expect(input).toBeOnTheScreen()
        await user.type(input, 'a'.repeat(30))
        const errorMessage = await screen.getByText(
            i18n.t('errors.group-name-too-long'),
        )

        await waitFor(() => {
            expect(errorMessage).toBeOnTheScreen()
        })
    })
})
