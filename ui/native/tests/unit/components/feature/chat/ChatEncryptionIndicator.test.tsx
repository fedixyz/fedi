import { cleanup, screen } from '@testing-library/react-native'
import React from 'react'
import { Text as MockText } from 'react-native'

import i18n from '@fedi/native/localization/i18n'

import ChatEncryptionIndicator from '../../../../../components/feature/chat/ChatEncryptionIndicator'
import { renderWithProviders } from '../../../../utils/render'

jest.mock('../../../../../components/ui/SvgImage', () => {
    return {
        __esModule: true,
        default: ({ name }: { name: string }) => <MockText>{name}</MockText>,
        SvgImageSize: {
            sm: 'sm',
        },
    }
})

describe('ChatEncryptionIndicator', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should label private rooms as encrypted', () => {
        renderWithProviders(<ChatEncryptionIndicator isEncrypted />)

        expect(screen.getByTestId('ChatEncryptionIndicator')).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('feature.chat.encrypted')),
        ).toBeOnTheScreen()
        expect(screen.getByText('LockSquareRounded')).toBeOnTheScreen()
    })

    it('should label public rooms as not encrypted', () => {
        renderWithProviders(<ChatEncryptionIndicator isEncrypted={false} />)

        expect(
            screen.getByText(i18n.t('feature.chat.not-encrypted')),
        ).toBeOnTheScreen()
        expect(screen.getByText('LockSquareRoundedOff')).toBeOnTheScreen()
    })
})
