import CheckIcon from '@fedi/common/assets/svgs/check.svg'
import CopyIcon from '@fedi/common/assets/svgs/copy.svg'

import { Icon } from '../components/Icon'
import { useCopy } from '../hooks'
import { styled } from '../styles'

interface Props {
    text: string
}

export const CopyButton: React.FC<Props> = ({ text }) => {
    const { copy, copied } = useCopy()

    return (
        <ButtonWrapper onClick={() => copy(text)}>
            <Icon icon={copied ? CheckIcon : CopyIcon} size="sm" />
        </ButtonWrapper>
    )
}

const ButtonWrapper = styled('div', {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'center',
})
