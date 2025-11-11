import Link from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'

import AppsFilledIcon from '@fedi/common/assets/svgs/apps-filled.svg'
import AppsIcon from '@fedi/common/assets/svgs/apps.svg'
import ChatFilledIcon from '@fedi/common/assets/svgs/chat-filled.svg'
import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import CommunityFilledIcon from '@fedi/common/assets/svgs/community-filled.svg'
import CommunityIcon from '@fedi/common/assets/svgs/community.svg'
import WalletFilledIcon from '@fedi/common/assets/svgs/wallet-filled.svg'
import WalletIcon from '@fedi/common/assets/svgs/wallet.svg'
import { selectMatrixHasNotifications } from '@fedi/common/redux'

import {
    chatRoute,
    homeRoute,
    miniAppsRoute,
    federationsRoute,
} from '../../constants/routes'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
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
            activeIcon: CommunityFilledIcon,
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
            path: miniAppsRoute,
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
            <Nav>
                {navLinks.map(nav => {
                    const isActive = getIsActive(nav.path)
                    return (
                        <NavItem key={nav.path} isActive={isActive}>
                            <Link href={nav.path}>
                                <NotificationDot visible={nav.hasNotification}>
                                    <Icon
                                        icon={
                                            isActive ? nav.activeIcon : nav.icon
                                        }
                                    />
                                </NotificationDot>
                            </Link>
                        </NavItem>
                    )
                })}
            </Nav>
        </Container>
    )
}

const Container = styled('nav', {
    background: theme.colors.white,
    borderTop: `1px solid ${theme.colors.extraLightGrey}`,
    width: '100%',
})

const Nav = styled('ul', {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px 0',
})

const NavItem = styled('li', {
    flex: 1,
    display: 'flex',
    listStyle: 'none',
    color: theme.colors.darkGrey,
    justifyContent: 'center',

    '&:hover, &:focus': {
        color: theme.colors.primary,
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
