import { useTranslation } from 'react-i18next'

import { MatrixMultispendEvent } from '@fedi/common/types'
import {
    isMultispendDepositEvent,
    isMultispendInvitationEvent,
    isMultispendWithdrawalRequestEvent,
} from '@fedi/common/utils/matrix'

import MultispendDepositEvent from './MultispendDepositEvent'
import MultispendEventTemplate from './MultispendEventTemplate'
import MultispendInvitationEvent from './MultispendInvitationEvent'
import MultispendWithdrawalEvent from './MultispendWithdrawalEvent'

type Props = {
    event: MatrixMultispendEvent
    isWide?: boolean
}

const ChatMultispendEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()

    if (isMultispendInvitationEvent(event)) {
        return <MultispendInvitationEvent event={event} />
    } else if (isMultispendDepositEvent(event)) {
        return <MultispendDepositEvent event={event} />
    } else if (isMultispendWithdrawalRequestEvent(event)) {
        return <MultispendWithdrawalEvent event={event} />
    }

    // Default case (TODOs)
    const body = 'body' in event.content ? event.content.body : ''
    return (
        <MultispendEventTemplate
            heading={t('feature.multispend.message-header')}
            body={`${body}: ${event.content.kind}`}
            footer={'TODO: Implement Me'}
        />
    )
}

export default ChatMultispendEvent
