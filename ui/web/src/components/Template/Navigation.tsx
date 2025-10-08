import Link from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'

import AppsFilledIcon from '@fedi/common/assets/svgs/apps-filled.svg'
import AppsIcon from '@fedi/common/assets/svgs/apps.svg'
import ChatFilledIcon from '@fedi/common/assets/svgs/chat-filled.svg'
import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import CommunityIcon from '@fedi/common/assets/svgs/community.svg'
import FediLogo from '@fedi/common/assets/svgs/fedi-logo.svg'
import WalletFilledIcon from '@fedi/common/assets/svgs/wallet-filled.svg'
import WalletIcon from '@fedi/common/assets/svgs/wallet.svg'
import { selectMatrixHasNotifications } from '@fedi/common/redux'

import {
    chatRoute,
    homeRoute,
    modsRoute,
    federationsRoute,
} from '../../constants/routes'
import { useAppSelector } from '../../hooks'
import { keyframes, styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { NotificationDot } from '../NotificationDot'

export const Navigation: React.FC = () => {
    const router = useRouter()
    const hasChatNotifications = useAppSelector(selectMatrixHasNotifications)

    const getIsActive = (navPath: string) => {
        if (navPath === router.pathname) return true
        if (navPath !== '/' && router.pathname.startsWith(navPath)) return true
        return false
    }

    const navLinks = [
        {
            path: homeRoute,
            icon: CommunityIcon,
            activeIcon: CommunityIcon,
            available: true,
            hasNotification: false,
        },
        {
            path: chatRoute,
            icon: ChatIcon,
            activeIcon: ChatFilledIcon,
            available: true,
            hasNotification: hasChatNotifications,
        },
        {
            path: modsRoute,
            icon: AppsIcon,
            activeIcon: AppsFilledIcon,
            available: true,
            hasNotification: false,
        },
        {
            path: federationsRoute,
            icon: WalletIcon,
            activeIcon: WalletFilledIcon,
            available: true,
            hasNotification: false,
        },
    ].filter(nav => nav.available)

    return (
        <Container>
            <Inner>
                <Logo>
                    <Link href={homeRoute}>
                        <FediLogo />
                    </Link>
                </Logo>
                <Nav>
                    {navLinks.map(nav => {
                        const isActive = getIsActive(nav.path)
                        return (
                            <NavItem key={nav.path} isActive={isActive}>
                                <Link href={nav.path}>
                                    <NotificationDot
                                        visible={nav.hasNotification}>
                                        <Icon
                                            icon={
                                                isActive
                                                    ? nav.activeIcon
                                                    : nav.icon
                                            }
                                        />
                                    </NotificationDot>
                                </Link>
                            </NavItem>
                        )
                    })}
                </Nav>
            </Inner>
        </Container>
    )
}

export const containerSlideIn = keyframes({
    '0%': {
        transform: 'translateX(-100%)',
        opacity: 0,
    },
    '100%': {
        transform: 'translateX(0)',
        opacity: 1,
    },
})

const Container = styled('nav', {
    width: 270,
    flexShrink: 0,
    padding: 32,
    background: theme.colors.white,
    animation: `${containerSlideIn} 200ms ease`,
    boxShadow: '0 0 17px rgba(1, 153, 176, 0.1)',

    '@md': {
        width: '100%',
        padding: 0,
        borderTop: `1px solid ${theme.colors.extraLightGrey}`,
        animation: 'none',
        boxShadow: 'none',
    },
})

const Inner = styled('div', {
    position: 'sticky',
    top: 32,

    '@md': {
        position: 'relative',
        top: 'auto',
    },
})

const Logo = styled('div', {
    marginBottom: 80,

    '& a': {
        textDecoration: 'none',
    },
    '& svg': {
        width: 88,
    },

    '@md': {
        display: 'none',
    },
})

const Nav = styled('ul', {
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 0',
    margin: '0 -8px',

    '@md': {
        flexDirection: 'row',
        justifyContent: 'center',
        margin: 0,
    },
})

const NavItem = styled('li', {
    flex: 1,
    display: 'flex',
    listStyle: 'none',
    color: theme.colors.darkGrey,

    '&:hover, &:focus': {
        color: theme.colors.primary,
    },

    '& a': {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '24px 8px',
        textDecoration: 'none',
        color: 'inherit',
    },

    '& svg': {
        display: 'block',
    },

    '@md': {
        justifyContent: 'center',

        '& a': {
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 4,
            padding: 12,
        },
    },

    '@xs': {
        '& a': {
            gap: 2,
            padding: 8,
            fontSize: theme.fontSizes.caption,
        },

        '& svg': {
            width: 20,
            height: 20,
        },
    },

    '@standalone': {
        '@sm': {
            '& a': {
                paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            },
        },
        '@xs': {
            '& a': {
                paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
            },
        },
    },

    variants: {
        isActive: {
            true: {
                color: theme.colors.primary,
            },
        },
    },
})
