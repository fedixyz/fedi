import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { MiniappApiDebugger } from '../../../../src/components/MiniappApiDebugger'

describe('MiniappApiDebugger', () => {
    it('should show the seed and save-file calls', () => {
        render(<MiniappApiDebugger />)

        expect(screen.getByText('fedi_getSeed')).toBeInTheDocument()
        expect(screen.getByText('fedi_saveFile')).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Request' }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Save JSON' }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Empty (rejects)' }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Bad name (rejects)' }),
        ).toBeInTheDocument()
    })
})
