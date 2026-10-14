import { stripAndDeduplicateWhitespace } from '@fedi/common/utils/strings'

import { styled } from '../../styles'
import { Icon } from '../Icon'
import { Text } from '../Text'

export default function PinnedMessage({
    pinnedMessage,
    compact = false,
}: {
    pinnedMessage: string
    /** Tighter padding and no pin icon, for use under a header */
    compact?: boolean
}) {
    return (
        <PinnedMessageContainer compact={compact} data-testid="PinnedMessage">
            {!compact && (
                <Icon icon="Pin" data-testid="PinnedMessage__PinIcon" />
            )}
            <Text
                variant="caption"
                css={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                {stripAndDeduplicateWhitespace(pinnedMessage)}
            </Text>
        </PinnedMessageContainer>
    )
}

const PinnedMessageContainer = styled('div', {
    alignItems: 'center',
    fediGradient: 'sky-banner',
    borderRadius: 16,
    display: 'flex',
    gap: 16,
    padding: 16,

    variants: {
        compact: {
            true: {
                padding: '8px 12px',
            },
        },
    },
})
