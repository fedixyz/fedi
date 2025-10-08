import { styled, theme } from '../styles'

export const Flex = styled('div', {
    display: 'flex',

    variants: {
        center: { true: { alignItems: 'center', justifyContent: 'center' } },
        align: {
            start: { alignItems: 'flex-start' },
            center: { alignItems: 'center' },
            end: { alignItems: 'flex-end' },
            stretch: { alignItems: 'stretch' },
        },
        justify: {
            start: { justifyContent: 'flex-start' },
            center: { justifyContent: 'center' },
            end: { justifyContent: 'flex-end' },
            between: { justifyContent: 'space-between' },
            around: { justifyContent: 'space-around' },
            evenly: { justifyContent: 'space-evenly' },
        },
        gap: {
            xxs: { gap: theme.spacing.xxs },
            xs: { gap: theme.spacing.xs },
            sm: { gap: theme.spacing.sm },
            md: { gap: theme.spacing.md },
            lg: { gap: theme.spacing.lg },
            xl: { gap: theme.spacing.xl },
            xxl: { gap: theme.spacing.xxl },
        },
        basis: { false: { flexBasis: 0 } },
        grow: {
            true: { flexGrow: 1 },
            false: { flexGrow: 0 },
        },
        shrink: {
            true: { flexShrink: 1 },
            false: { flexShrink: 0 },
        },
        fullWidth: { true: { width: '100%' } },
        wrap: { true: { flexWrap: 'wrap' } },
    },
})

export const Row = styled(Flex, {
    flexDirection: 'row',
})

export const Column = styled(Flex, {
    flexDirection: 'column',
})
