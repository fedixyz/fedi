import { screen } from '@testing-library/react'

import { setupStore } from '@fedi/common/redux'

import SurveyModal from '../../src/components/SurveyModal'
import i18n from '../../src/localization/i18n'
import { AppState } from '../../src/state/store'
import { renderWithProviders } from '../../src/utils/test-utils/render'

describe('SurveyModal', () => {
    let state: AppState
    let store

    beforeEach(() => {
        store = setupStore()
        state = store.getState()

        jest.clearAllMocks()
    })

    it('should render with the correct title, description, and button', async () => {
        renderWithProviders(<SurveyModal />, {
            preloadedState: {
                support: {
                    ...state.support,
                    surveyUrl: 'https://test.fedi.xyz/survey',
                    lastShownSurveyTimestamp: -1,
                },
            },
        })

        const titles = screen.getAllByText(
            i18n.t('feature.support.survey-title'),
        )
        const descriptions = screen.getAllByText(
            i18n.t('feature.support.survey-description'),
        )
        const button = screen.getByText(i18n.t('feature.support.give-feedback'))

        // expects two titles and two descriptions because the Modal component includes a visually hidden title and description for accessibility
        expect(titles.length).toBe(2)
        expect(descriptions.length).toBe(2)
        expect(button).toBeInTheDocument()
    })
})
