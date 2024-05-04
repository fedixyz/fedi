import { Group } from '../../types'

// Mock bridge to prevent further imports from pulling in dependencies
// that cause these tests to fail
jest.mock('../../localization/i18n', () => ({
    t: jest.fn(() => 'mocked error message'),
}))
jest.mock('../../constants', () => ({
    FEDI_GENERAL_CHANNEL_GROUP: {},
}))

describe('types', () => {
    describe('Group', () => {
        it('should create Groups from latest invitation links', () => {
            const GROUP_INVITATION_LINK =
                'fedi:group:d1mmq3fmp5zg37dpmin1j_av:::'

            const decodedGroup = Group.decodeInvitationLink(
                GROUP_INVITATION_LINK,
            )

            expect(decodedGroup.id).toEqual('d1mmq3fmp5zg37dpmin1j_av')
            expect(decodedGroup.invitationCode).toEqual(GROUP_INVITATION_LINK)
        })
        it('should create Groups from old invitation links', () => {
            const OLD_GROUP_INVITATION_LINK =
                'fedi:group:d1mmq3fmp5zg37dpmin1j_av'

            const decodedGroup = Group.decodeInvitationLink(
                OLD_GROUP_INVITATION_LINK,
            )

            expect(decodedGroup.id).toEqual('d1mmq3fmp5zg37dpmin1j_av')

            const updatedInvitationLink = `${OLD_GROUP_INVITATION_LINK}:::`
            expect(decodedGroup.invitationCode).toEqual(updatedInvitationLink)
        })
        it('should fail when decoding invalid invitation links', () => {
            const INVALID_INVITATION_LINK_1 = 'd1mmq3fmp5zg37dpmin1j_av'
            const INVALID_INVITATION_LINK_2 = 'fedi:d1mmq3fmp5zg37dpmin1j_av'
            const INVALID_INVITATION_LINK_3 =
                'fedi:group d1mmq3fmp5zg37dpmin1j_av'
            const INVALID_INVITATION_LINK_4 = 'fedi:group:'
            const INVALID_INVITATION_LINK_5 = 'fedi:group::::'

            expect(() => {
                Group.decodeInvitationLink(INVALID_INVITATION_LINK_1)
            }).toThrowError()
            expect(() => {
                Group.decodeInvitationLink(INVALID_INVITATION_LINK_2)
            }).toThrowError()
            expect(() => {
                Group.decodeInvitationLink(INVALID_INVITATION_LINK_3)
            }).toThrowError()
            expect(() => {
                Group.decodeInvitationLink(INVALID_INVITATION_LINK_4)
            }).toThrowError()
            expect(() => {
                Group.decodeInvitationLink(INVALID_INVITATION_LINK_5)
            }).toThrowError()
        })
    })
})
