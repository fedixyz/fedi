import React from 'react'
import { useTranslation } from 'react-i18next'

import { MatrixEvent } from '@fedi/common/types'

import { ChatBottomDrawer } from './ChatBottomDrawer'
import { MatrixReactionEmojiPicker } from './MatrixReactionEmojiPicker'

type Props = {
    event: MatrixEvent
    open: boolean
    pendingReaction?: string | null
    onOpenChange(open: boolean): void
    onSelect(reactionKey: string): void
}

export const MatrixReactionEmojiPickerDrawer: React.FC<Props> = ({
    event,
    open,
    pendingReaction,
    onOpenChange,
    onSelect,
}) => {
    const { t } = useTranslation()

    return (
        <ChatBottomDrawer
            open={open}
            title={t('words.react')}
            onOpenChange={onOpenChange}>
            <MatrixReactionEmojiPicker
                event={event}
                pendingReaction={pendingReaction}
                onSelect={onSelect}
            />
        </ChatBottomDrawer>
    )
}
