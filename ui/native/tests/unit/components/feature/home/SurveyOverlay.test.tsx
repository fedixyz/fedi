import { screen } from '@testing-library/react-native'

import { setupStore } from '@fedi/common/redux'
import i18n from '@fedi/native/localization/i18n'

import SurveyOverlay from '../../../../../components/feature/home/SurveyOverlay'
import { AppState } from '../../../../../state/store'
import { renderWithProviders } from '../../../../utils/render'

describe('SurveyModal', () => {
    let state: AppState
    let store

    beforeEach(() => {
        store = setupStore()
        state = store.getState()

        jest.clearAllMocks()
    })

    it('should render with the correct title, description, and button', async () => {
        renderWithProviders(<SurveyOverlay />, {
            preloadedState: {
                support: {
                    ...state.support,
                    surveyUrl: 'https://test.fedi.xyz/survey',
                    lastShownSurveyTimestamp: -1,
                },
            },
        })

        const title = screen.getByText(i18n.t('feature.support.survey-title'))
        const description = screen.getByText(
            i18n.t('feature.support.survey-description'),
        )
        const button = screen.getByText(i18n.t('feature.support.give-feedback'))

        expect(title).toBeOnTheScreen()
        expect(description).toBeOnTheScreen()
        expect(button).toBeOnTheScreen()
    })
})
