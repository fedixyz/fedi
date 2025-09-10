import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { HoloLoader } from '../../src/components/HoloLoader'

describe('/components/HoloLoader', () => {
    describe('when a label is provided as a prop', () => {
        it('should display the label', () => {
            render(<HoloLoader label="test label" />)

            const label = screen.getByText('test label')
            expect(label).toBeInTheDocument()
        })
    })
})
