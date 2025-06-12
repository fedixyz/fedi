import { selectMatrixRoomMultispendStatus } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import FederationGate from '../federations/FederationGate'

const MultispendFederationGate: React.FC<{
    children: React.ReactNode
    roomId: string
}> = ({ children, roomId }) => {
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )

    if (!multispendStatus) return null

    const inviteCode =
        multispendStatus.status === 'activeInvitation'
            ? multispendStatus.state.invitation.federationInviteCode
            : multispendStatus.finalized_group.invitation.federationInviteCode

    return <FederationGate inviteCode={inviteCode}>{children}</FederationGate>
}

export default MultispendFederationGate
