import { styled, theme } from '../styles'

export const EmptyState = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px 16px',
    textAlign: 'center',
    color: theme.colors.darkGrey,
    border: `1px dashed ${theme.colors.lightGrey}`,
    borderRadius: 16,

    '@sm': {
        margin: '0 16px',
        border: 'none',
    },
})
