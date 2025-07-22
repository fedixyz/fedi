import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { ProfileIcon } from '../../components/ProfileIcon'

describe('/components/ProfileIcon', () => {
    describe('when a url is provided as a prop', () => {
        it('should display the url', () => {
            render(<ProfileIcon url="https://fedi.xyz" />)

            const image = screen.getByAltText('profile-image')
            expect(image).toBeInTheDocument()
        })
    })

    describe('when no url is provided as a prop', () => {
        it('should display the icon', () => {
            render(<ProfileIcon />)

            const icon = screen.getByTestId('empty-profile-icon')
            expect(icon).toBeInTheDocument()
        })
    })
})
