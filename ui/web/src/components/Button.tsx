import Link, { LinkProps } from 'next/link'
import React from 'react'

import { CSSProp, styled, theme } from '../styles'
import { CircularLoader } from './CircularLoader'
import { Icon, IconProps } from './Icon'

interface BaseProps {
    variant?: 'primary' | 'secondary' | 'tertiary' | 'outline'
    size?: 'md' | 'sm' | 'xs'
    icon?: IconProps['icon']
    width?: 'auto' | 'full'
    loading?: boolean
    disabled?: boolean
    css?: CSSProp
}
type ButtonProps = BaseProps &
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps>

type ButtonLinkProps = BaseProps &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps> &
    Omit<LinkProps, keyof BaseProps>

type ButtonExternalLinkProps = BaseProps &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps>

type ButtonFileLabelProps = BaseProps &
    Omit<React.LabelHTMLAttributes<HTMLLabelElement>, keyof BaseProps>

type Props =
    | ButtonProps
    | ButtonLinkProps
    | ButtonExternalLinkProps
    | ButtonFileLabelProps

export const Button: React.FC<Props> = ({
    variant = 'primary',
    size = 'md',
    width = 'auto',
    icon,
    children,
    loading,
    disabled,
    onClick,
    ...props
}) => {
    const content = (
        <>
            <ButtonContent loading={loading}>
                {icon && <Icon icon={icon} size="xs" />}
                <div>{children}</div>
            </ButtonContent>
            <ButtonLoader loading={loading}>
                <CircularLoader key={`${loading}`} size="xs" />
            </ButtonLoader>
        </>
    )

    const sharedProps = {
        variant: variant,
        size: size,
        width: width,
        disabled: disabled || loading,
        loading: loading,
        onClick:
            disabled || loading
                ? undefined
                : (onClick as React.MouseEventHandler<HTMLElement>),
    }

    if ('href' in props && props.href !== undefined) {
        if (typeof props.href === 'string' && props.href.startsWith('http')) {
            return (
                <ButtonBase
                    as="a"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={props.href || ''}
                    {...(props as React.HTMLAttributes<HTMLAnchorElement>)}
                    {...sharedProps}>
                    {content}
                </ButtonBase>
            )
        } else {
            return (
                <ButtonBase
                    as={Link}
                    href={props.href || ''}
                    {...(props as React.HTMLAttributes<HTMLAnchorElement>)}
                    {...sharedProps}>
                    {content}
                </ButtonBase>
            )
        }
    } else if ('htmlFor' in props) {
        return (
            <ButtonBase
                as="label"
                {...(props as React.HTMLAttributes<HTMLLabelElement>)}
                {...sharedProps}>
                {content}
            </ButtonBase>
        )
    } else {
        return (
            <ButtonBase
                {...(props as React.HTMLAttributes<HTMLButtonElement>)}
                {...sharedProps}>
                {content}
            </ButtonBase>
        )
    }
}

const ButtonBase = styled('button', {
    position: 'relative',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 500,
    borderRadius: 40,
    border: 'none',
    textDecoration: 'none',
    cursor: 'pointer',
    transition:
        'background-color 100ms ease, filter 100ms ease, opacity 100ms ease',

    '&:disabled': {
        pointerEvents: 'none',
    },

    variants: {
        variant: {
            primary: {
                background: `linear-gradient(${theme.colors.white20}, transparent), linear-gradient(${theme.colors.primary}, ${theme.colors.primary})`,
                color: theme.colors.white,
                '&:hover': {
                    filter: 'brightness(1.25)',
                },
                '&:active': {
                    filter: 'brightness(1.5)',
                },
            },
            secondary: {
                background: `linear-gradient(${theme.colors.white}, ${theme.colors.primary10}), linear-gradient(${theme.colors.white}, ${theme.colors.white})`,
                boxShadow: `0 0 0 0.25px ${theme.colors.lightGrey} inset`,
                color: theme.colors.primary,
                '&:hover': {
                    filter: 'brightness(0.95)',
                },
                '&:active': {
                    filter: 'brightness(0.9)',
                },
            },
            tertiary: {
                background: 'none',
                color: theme.colors.primary,
                '&:hover': {
                    background: theme.colors.primary05,
                },
                '&:active': {
                    background: theme.colors.primary10,
                },
            },
            outline: {
                background: 'none',
                color: theme.colors.primary,
                border: `2px solid ${theme.colors.primary}`,
                '&:hover': {
                    background: theme.colors.primary05,
                },
                '&:active': {
                    background: theme.colors.primary10,
                },
            },
        },
        size: {
            md: {
                height: 48,
                padding: '0 30px',
                fontSize: 14,
            },
            sm: {
                height: 32,
                padding: '0 26px',
                fontSize: 14,
            },
            xs: {
                height: 24,
                padding: '0 20px',
                fontSize: 12,
            },
        },
        width: {
            auto: {
                width: 'auto',
            },
            full: {
                width: '100%',
            },
        },
        disabled: {
            true: {
                pointerEvents: 'none',
                opacity: 0.5,
            },
        },
        loading: { true: {} },
    },
    compoundVariants: [
        {
            disabled: true,
            loading: true,
            css: { opacity: 1 },
        },
    ],
    defaultVariants: {
        variant: 'primary',
        size: 'md',
    },
})

const ButtonContent = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'opacity 100ms ease',

    variants: {
        loading: {
            true: {
                opacity: 0,
            },
        },
    },
})

const ButtonLoader = styled('div', {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    opacity: 0,

    variants: {
        loading: {
            true: {
                opacity: 1,
            },
        },
    },
})
