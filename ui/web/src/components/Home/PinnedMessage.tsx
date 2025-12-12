import PinIcon from '@fedi/common/assets/svgs/pin.svg'
import { stripAndDeduplicateWhitespace } from '@fedi/common/utils/strings'

import { styled } from '../../styles'
import { Icon } from '../Icon'
import { Text } from '../Text'

export default function PinnedMessage({
    pinnedMessage,
}: {
    pinnedMessage: string
}) {
    return (
        <PinnedMessageContainer>
            <Icon icon={PinIcon} />
            <Text variant="caption" css={{ flex: 1 }}>
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
})
