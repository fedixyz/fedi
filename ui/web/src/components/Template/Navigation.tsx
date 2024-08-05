import Link from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import ChatFilledIcon from '@fedi/common/assets/svgs/chat-filled.svg'
import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import CogFilledIcon from '@fedi/common/assets/svgs/cog-filled.svg'
import CogIcon from '@fedi/common/assets/svgs/cog.svg'
import FediLogo from '@fedi/common/assets/svgs/fedi-logo.svg'
import HomeFilledIcon from '@fedi/common/assets/svgs/home-filled.svg'
import HomeIcon from '@fedi/common/assets/svgs/home.svg'
import { selectMatrixHasNotifications } from '@fedi/common/redux'

import { useAppSelector } from '../../hooks'
import { keyframes, styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { NotificationDot } from '../NotificationDot'

export const Navigation: React.FC = () => {
    const router = useRouter()
    const { t } = useTranslation()
    const hasChatNotifications = useAppSelector(selectMatrixHasNotifications)

    const getIsActive = (navPath: string) => {
        if (navPath === router.pathname) return true
        if (navPath !== '/' && router.pathname.startsWith(navPath)) return true
        return false
    }

    const navLinks = [
        {
            name: 'words.home' as const,
            path: '/',
            icon: HomeIcon,
            activeIcon: HomeFilledIcon,
            available: true,
            hasNotification: false,
        },
        {
            name: 'words.chat' as const,
            path: '/chat',
            icon: ChatIcon,
            activeIcon: ChatFilledIcon,
            available: true,
            hasNotification: hasChatNotifications,
        },
        {
            name: 'words.account' as const,
            path: '/settings',
            icon: CogIcon,
            activeIcon: CogFilledIcon,
            available: true,
            hasNotification: false,
        },
    ].filter(nav => nav.available)

    return (
        <Container>
            <Inner>
                <Logo>
                    <Link href="/">
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
                                    <NavLabel>{t(nav.name)}</NavLabel>
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
    padding: 0,
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

const NavLabel = styled('div', {
    fontSize: theme.fontSizes.body,
    fontWeight: theme.fontWeights.medium,

    '@sm': {
        fontSize: theme.fontSizes.caption,
    },
})
