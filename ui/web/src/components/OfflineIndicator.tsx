import { keyframes, styled, theme } from '../styles'
import { CircularLoader } from './CircularLoader'
import { Text } from './Text'

interface Props {
    label: string
}

export const OfflineIndicator = ({ label }: Props) => {
    return (
        <Indicator role="status" aria-live="polite">
            <CircularLoader size={16} />
            <Text variant="small" weight="medium">
                {label}
            </Text>
        </Indicator>
    )
}

const fadeIn = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const Indicator = styled('div', {
    alignItems: 'center',
    animation: `${fadeIn} 150ms ease`,
    backgroundColor: theme.colors.lightGrey,
    borderRadius: 8,
    color: theme.colors.primary,
    display: 'flex',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    left: '50%',
    width: 150,
    padding: theme.spacing.sm,
    position: 'fixed',
    top: theme.spacing.md,
    transform: 'translateX(-50%)',
    zIndex: 10,
})
