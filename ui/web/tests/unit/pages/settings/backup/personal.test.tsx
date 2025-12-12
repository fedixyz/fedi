import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setupStore } from '@fedi/common/redux'

import i18n from '../../../../../src/localization/i18n'
import PersonalBackupPage from '../../../../../src/pages/settings/backup/personal'
import { renderWithProviders } from '../../../../utils/render'

const nuxSpy = jest.fn()
jest.mock('@fedi/common/hooks/nux', () => ({
    ...jest.requireActual('@fedi/common/hooks/nux'),
    useNuxStep: () => [false, nuxSpy],
}))

jest.mock('@fedi/web/src/lib/bridge', () => ({
    ...jest.requireActual('@fedi/web/src/lib/bridge'),
    fedimint: {
        getMnemonic: jest
            .fn()
            .mockResolvedValue([
                'one',
                'two',
                'three',
                'four',
                'five',
                'six',
                'seven',
                'eight',
                'nine',
                'ten',
                'eleven',
                'twelve',
            ]),
    },
}))

describe('/pages/settings/backup/personal', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()

    beforeAll(() => {
        store = setupStore()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('when the page loads', () => {
        it('should display the title and help text', async () => {
            renderWithProviders(<PersonalBackupPage />, {
                store,
            })

            const title = await screen.findByText(
                i18n.t('feature.backup.personal-backup-title'),
            )
            const helpText = await screen.findByText(
                i18n.t('feature.backup.personal-backup-description'),
            )

            expect(title).toBeInTheDocument()
            expect(helpText).toBeInTheDocument()
        })

        it('should display the mnemonic', async () => {
            renderWithProviders(<PersonalBackupPage />, {
                store,
            })

            // No need to check for all twelve words
            const word1 = await screen.findByDisplayValue('one')
            const word2 = await screen.findByDisplayValue('two')
            const word3 = await screen.findByDisplayValue('three')

            expect(word1).toBeInTheDocument()
            expect(word2).toBeInTheDocument()
            expect(word3).toBeInTheDocument()
        })
    })

    describe('when the button is clicked', () => {
        it('should call completePersonalBackup function', async () => {
            renderWithProviders(<PersonalBackupPage />, {
                store,
            })

            const button = await screen.findByTestId('confirm-button')
            user.click(button)

            await waitFor(() => {
                expect(nuxSpy).toHaveBeenCalled()
            })
        })
    })
})
