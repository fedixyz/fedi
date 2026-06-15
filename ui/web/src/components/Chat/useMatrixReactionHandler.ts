import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMessageReactionsEnabled,
    toggleMatrixReaction,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { canAddMatrixReaction } from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../hooks'

export function useMatrixReactionHandler() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()
    const messageReactionsEnabled = useAppSelector(
        selectMessageReactionsEnabled,
    )
    const [reactingEmoji, setReactingEmoji] = useState<string | null>(null)

    const handleReaction = useCallback(
        async ({
            event,
            reactionKey,
            onSuccess,
        }: {
            event: MatrixEvent
            reactionKey: string
            onSuccess?: () => void
        }) => {
            if (
                !messageReactionsEnabled ||
                !event.roomId ||
                reactingEmoji ||
                !canAddMatrixReaction(event, reactionKey)
            )
                return false

            setReactingEmoji(reactionKey)
            try {
                await dispatch(
                    toggleMatrixReaction({
                        fedimint,
                        roomId: event.roomId,
                        eventId: event.id,
                        reactionKey,
                    }),
                ).unwrap()
                onSuccess?.()
                return true
            } catch (err) {
                toast.error(t, err, 'errors.unknown-error')
                return false
            } finally {
                setReactingEmoji(null)
            }
        },
        [dispatch, fedimint, messageReactionsEnabled, reactingEmoji, t, toast],
    )

    return {
        handleReaction,
        messageReactionsEnabled,
        reactingEmoji,
    }
}
