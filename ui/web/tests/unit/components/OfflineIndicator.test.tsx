import '@testing-library/jest-dom'
import { cleanup, screen } from '@testing-library/react'

import { OfflineIndicator } from '../../../src/components/OfflineIndicator'
import { renderWithProviders } from '../../utils/render'

describe('/components/OfflineIndicator', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should render the provided label', () => {
        renderWithProviders(<OfflineIndicator label="Waiting for network..." />)

        expect(screen.getByRole('status')).toHaveTextContent(
            'Waiting for network...',
        )
    })
})
