import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { RecoveryInProgress } from '../../components/RecoveryInProgress'

jest.mock('@fedi/common/hooks/recovery', () => ({
    ...jest.requireActual('@fedi/common/hooks/recovery'),
    useRecoveryProgress: () => ({
        progress: 0.5,
    }),
}))

describe('/components/RecoveryInProgress', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when a label is provided as a prop', () => {
        it('should display the label', () => {
            render(<RecoveryInProgress label="test label" />)

            const label = screen.getByText('test label')
            expect(label).toBeInTheDocument()
        })
    })

    describe('when the progress is 0.5', () => {
        it('should display progress as 50%', () => {
            render(<RecoveryInProgress />)

            const percent = screen.getByText('50%')
            expect(percent).toBeInTheDocument()
        })
    })
})
