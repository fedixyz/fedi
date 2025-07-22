import CloseIcon from '@fedi/common/assets/svgs/close.svg'

import { styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { Text } from '../Text'

type Props = {
    title: string
    description: string
    buttonLabel: string
    onInstall(): void
    onClose(): void
}

export const InstallBanner: React.FC<Props> = ({
    title,
    description,
    buttonLabel,
    onInstall,
    onClose,
}) => {
    return (
        <Component aria-label="Install Banner">
            <IconWrapper onClick={onClose} aria-label="Close">
                <Icon icon={CloseIcon} />
            </IconWrapper>
            <TextWrapper>
                <Text weight="bold" variant="body">
                    {title}
                </Text>
                {description && <Text variant="body">{description}</Text>}
            </TextWrapper>
            <ButtonWrapper>
                <InstallButton onClick={onInstall}>{buttonLabel}</InstallButton>
            </ButtonWrapper>
        </Component>
    )
}

const Component = styled('div', {
    alignItems: 'center',
    background: theme.colors.moneyGreen,
    color: theme.colors.white,
    display: 'flex',
    gap: 12,
    justifyContent: 'space-between',
    padding: 10,
})

const IconWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
})

const TextWrapper = styled('div', {
    alignItems: 'flex-start',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    textAlign: 'left',
})

const ButtonWrapper = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    width: 80,
})

const InstallButton = styled('button', {
    background: theme.colors.white,
    color: theme.colors.moneyGreen,
    borderRadius: 18,
    fontWeight: 'bold',
    height: 36,
    width: 80,
})
