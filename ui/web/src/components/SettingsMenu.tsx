import Link from 'next/link'
import React from 'react'

import ChevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'

import { styled, theme } from '../styles'
import { Icon, IconProps } from './Icon'
import { Text } from './Text'

interface MenuItem {
    icon: IconProps['icon']
    label: string
    action?: React.ReactNode
    disabled?: boolean
    hidden?: boolean
    href?: string
    onClick?: () => void
}

export interface MenuGroup {
    label: string
    items: MenuItem[]
}

export interface SettingsMenuProps {
    menu: MenuGroup[]
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ menu }) => {
    // Filter out hidden items, filter out groups that have no items left.
    menu = menu
        .map(group => ({
            ...group,
            items: group.items.filter(item => !item.hidden),
        }))
        .filter(group => group.items.length > 0)

    return (
        <Menu>
            {menu.map(group => (
                <MenuGroup key={group.label}>
                    <MenuGroupName>
                        <Text>{group.label}</Text>
                    </MenuGroupName>
                    <MenuGroupItems>
                        {group.items.map(item => {
                            const linkProps = item.href
                                ? { as: Link, href: item.href }
                                : undefined
                            return (
                                <MenuItem
                                    {...linkProps}
                                    key={item.label}
                                    disabled={!!item.disabled}
                                    hasCustomAction={!!item.action}
                                    onClick={
                                        item.disabled ? undefined : item.onClick
                                    }>
                                    <>
                                        <Icon icon={item.icon} />
                                        <Text>{item.label}</Text>
                                        {item.action || (
                                            <Icon icon={ChevronRightIcon} />
                                        )}
                                    </>
                                </MenuItem>
                            )
                        })}
                    </MenuGroupItems>
                </MenuGroup>
            ))}
        </Menu>
    )
}

const Menu = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const MenuGroup = styled('div', {
    marginBottom: 20,
})

const MenuGroupName = styled('div', {
    color: theme.colors.black,
    padding: '8px 0',
})

const MenuGroupItems = styled('div', {
    backgroundColor: theme.colors.offWhite100,
    borderRadius: 16,
    padding: 8,
})

const MenuItem = styled('button', {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '12px 8px',
    borderRadius: 8,
    textAlign: 'left',
    transition: 'background-color 100ms ease',

    '& > *:nth-child(0n+2)': {
        flex: 1,
    },

    '&:hover, &:focus': {
        background: theme.colors.primary05,
    },

    variants: {
        disabled: {
            true: {
                cursor: 'not-allowed',
                color: theme.colors.grey,
                background: 'none',
                '&:hover, &:focus': {
                    background: 'none',
                },
            },
        },
        hasCustomAction: {
            true: {
                '&:hover, &:focus': {
                    background: 'none',
                },
            },
            false: {},
        },
    },
    compoundVariants: [
        {
            disabled: false,
            hasCustomAction: false,
            css: {
                '& > *:last-child': {
                    opacity: 0.5,
                    transition: 'transform 100ms ease, opacity 100ms ease',
                },
                '&:hover, &:focus': {
                    '& > *:last-child': {
                        opacity: 1,
                        transform: 'translateX(2px)',
                    },
                },
            },
        },
        {
            disabled: true,
            hasCustomAction: false,
            css: {
                '& > *:last-child': {
                    opacity: 0.5,
                },
            },
        },
    ],
})
