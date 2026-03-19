import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import AppsFilledIcon from '@fedi/common/assets/svgs/apps-filled.svg'
import AppsIcon from '@fedi/common/assets/svgs/apps.svg'
import ChatFilledIcon from '@fedi/common/assets/svgs/chat-filled.svg'
import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import CommunityFilledIcon from '@fedi/common/assets/svgs/community-filled.svg'
import CommunityIcon from '@fedi/common/assets/svgs/community.svg'
import ScanIcon from '@fedi/common/assets/svgs/scan.svg'
import WalletFilledIcon from '@fedi/common/assets/svgs/wallet-filled.svg'
import WalletIcon from '@fedi/common/assets/svgs/wallet.svg'
import {
    selectMatrixHasNotifications,
    setLastUsedTab,
} from '@fedi/common/redux'
import { HomeNavigationTab } from '@fedi/common/types/linking'

import {
    chatRoute,
    homeRoute,
    miniAppsRoute,
    walletRoute,
} from '../../constants/routes'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { NotificationDot } from '../NotificationDot'
import { ScanDialog } from '../ScanDialog'
import { Text } from '../Text'

export const Navigation: React.FC = () => {
    const [open, setOpen] = useState(false)

    const router = useRouter()
    const hasChatNotifications = useAppSelector(selectMatrixHasNotifications)
    const { t } = useTranslation()
    const dispatch = useAppDispatch()

    const getIsActive = (navPath: string) => {
        if (navPath === router.pathname) return true
        if (navPath !== '/' && router.pathname.startsWith(navPath)) return true
        return false
    }

    const navLinks = [
        {
            path: walletRoute,
            icon: WalletIcon,
            activeIcon: WalletFilledIcon,
            available: true,
            hasNotification: false,
            label: t('words.wallet'),
            tab: HomeNavigationTab.Wallet,
        },
        {
            path: chatRoute,
            icon: ChatIcon,
            activeIcon: ChatFilledIcon,
            available: true,
            hasNotification: hasChatNotifications,
            label: t('words.chat'),
            tab: HomeNavigationTab.Chat,
        },
        {
            path: 'scan',
            icon: ScanIcon,
            activeIcon: ScanIcon,
            available: true,
            hasNotification: false,
            label: t('phrases.scan-slash-paste'),
            tab: HomeNavigationTab.Chat,
        },
        {
            path: miniAppsRoute,
            icon: AppsIcon,
            activeIcon: AppsFilledIcon,
            available: true,
            hasNotification: false,
            label: t('words.mods'),
            tab: HomeNavigationTab.MiniApps,
        },
        {
            path: homeRoute,
            icon: CommunityIcon,
            activeIcon: CommunityFilledIcon,
            available: true,
            hasNotification: false,
            label: t('words.community'),
            tab: HomeNavigationTab.Home,
        },
    ].filter(nav => nav.available)

    return (
        <Container>
            <Nav>
                {navLinks.map(nav => {
                    const isActive = getIsActive(nav.path)

                    if (nav.path === 'scan') {
                        return (
                            <NavItem key={nav.path} isActive={isActive}>
                                <ScanItem onClick={() => setOpen(true)}>
                                    <ScanIconContainer>
                                        <Icon icon={nav.icon} size={24} />
                                    </ScanIconContainer>
                                    <Label weight="medium" variant="small">
                                        {nav.label}
                                    </Label>
                                </ScanItem>
                            </NavItem>
                        )
                    }

                    return (
                        <NavItem key={nav.path} isActive={isActive}>
                            <Link
                                href={nav.path}
                                onClick={() =>
                                    dispatch(setLastUsedTab(nav.tab))
                                }>
                                <NotificationDot visible={nav.hasNotification}>
                                    <Icon
                                        icon={
                                            isActive ? nav.activeIcon : nav.icon
                                        }
                                        size={24}
                                    />
                                </NotificationDot>
                                <Label weight="medium" variant="small">
                                    {nav.label}
                                </Label>
                            </Link>
                        </NavItem>
                    )
                })}
            </Nav>
            <ScanDialog open={open} onOpenChange={setOpen} />
        </Container>
    )
}

const Label = styled(Text, {
    color: theme.colors.darkGrey,
    marginTop: 4,
})

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

const ScanIconContainer = styled('div', {
    position: 'absolute',
    top: -36,
    width: 48,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fediGradient: 'black',
    borderRadius: 1024,
    color: theme.colors.white,
})

const ScanItem = styled('button', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 24,
    position: 'relative',
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

    '& a': {
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
    },

    variants: {
        isActive: {
            true: {
                color: theme.colors.primary,
            },
        },
    },
})
