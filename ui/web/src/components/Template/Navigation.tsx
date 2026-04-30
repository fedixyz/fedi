import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    selectCommunities,
    selectLoadedFederations,
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
import CommunitiesOverlay from '../CommunitiesOverlay'
import { Icon, SvgIconName } from '../Icon'
import { NotificationDot } from '../NotificationDot'
import { ScanDialog } from '../ScanDialog'
import SelectWalletOverlay from '../SelectWalletOverlay'
import { Text } from '../Text'

interface ScanLink {
    path: string
    label: string
    icon: SvgIconName
    activeIcon: SvgIconName
    hasNotification: boolean
}

type NavLink = ScanLink & { tab: HomeNavigationTab }

export const Navigation: React.FC = () => {
    const [scanDialogOpen, setScanDialogOpen] = useState(false)
    const [walletOverlayOpen, setWalletOverlayOpen] = useState(false)
    const [communitiesOverlayOpen, setCommunitiesOverlayOpen] = useState(false)

    const router = useRouter()
    const hasChatNotifications = useAppSelector(selectMatrixHasNotifications)
    const communities = useAppSelector(selectCommunities)
    const loadedFederations = useAppSelector(selectLoadedFederations)
    const { t } = useTranslation()
    const dispatch = useAppDispatch()

    const getIsActive = (navPath: string) => {
        if (navPath === router.pathname) return true
        if (navPath !== '/' && router.pathname.startsWith(navPath)) return true
        return false
    }

    const handleNavClick = (
        nav: NavLink,
        isActive: boolean,
        event: React.MouseEvent<HTMLAnchorElement>,
    ) => {
        if (
            nav.path === walletRoute &&
            isActive &&
            loadedFederations.length >= 2
        ) {
            event.preventDefault()
            setWalletOverlayOpen(true)
            return
        }

        if (nav.path === homeRoute && isActive && communities.length >= 2) {
            event.preventDefault()
            setCommunitiesOverlayOpen(true)
            return
        }

        dispatch(setLastUsedTab(nav.tab))
    }

    const navLinks: (NavLink | ScanLink)[] = [
        {
            path: walletRoute,
            icon: 'Wallet',
            activeIcon: 'WalletFilled',
            hasNotification: false,
            label: t('words.wallet'),
            tab: HomeNavigationTab.Wallet,
        },
        {
            path: chatRoute,
            icon: 'Chat',
            activeIcon: 'ChatFilled',
            hasNotification: hasChatNotifications,
            label: t('words.chat'),
            tab: HomeNavigationTab.Chat,
        },
        {
            path: 'scan',
            icon: 'Scan',
            activeIcon: 'Scan',
            hasNotification: false,
            label: t('phrases.scan-slash-paste'),
        },
        {
            path: miniAppsRoute,
            icon: 'Apps',
            activeIcon: 'AppsFilled',
            hasNotification: false,
            label: t('words.mods'),
            tab: HomeNavigationTab.MiniApps,
        },
        {
            path: homeRoute,
            icon: 'Community',
            activeIcon: 'CommunityFilled',
            hasNotification: false,
            label: t('words.community'),
            tab: HomeNavigationTab.Home,
        },
    ]

    return (
        <NavBar>
            <Shadow />
            <Nav>
                {navLinks.map(nav => {
                    const isActive = getIsActive(nav.path)

                    // Handle ScanLink separately as it's rendered as a dialog
                    if (!('tab' in nav)) {
                        return (
                            <NavItem key={nav.path} isActive={isActive}>
                                <ScanItem
                                    onClick={() => setScanDialogOpen(true)}>
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
                                onClick={event => {
                                    handleNavClick(nav, isActive, event)
                                }}>
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
            <ScanDialog
                open={scanDialogOpen}
                onOpenChange={setScanDialogOpen}
            />
            <SelectWalletOverlay
                open={walletOverlayOpen}
                onOpenChange={setWalletOverlayOpen}
            />
            <CommunitiesOverlay
                open={communitiesOverlayOpen}
                onOpenChange={setCommunitiesOverlayOpen}
            />
        </NavBar>
    )
}

const NavBar = styled('nav', {
    background: theme.colors.white,
    padding: '0 5px',
    position: 'relative',
    width: '100%',
    paddingBottom: 0,

    '@standalone': {
        '@sm': {
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        },
    },
})

const Shadow = styled('div', {
    background: `linear-gradient(to top, ${theme.colors.primary05}, transparent)`,
    bottom: '100%',
    height: 48,
    left: 0,
    right: 0,
    pointerEvents: 'none',
    position: 'absolute',
})

const Nav = styled('ul', {
    display: 'flex',
    justifyContent: 'center',
    padding: `${theme.spacing.md} 0`,
})

const NavItem = styled('li', {
    flex: 1,
    display: 'flex',
    listStyle: 'none',
    color: theme.colors.darkGrey,
    justifyContent: 'center',
    outline: 'none',

    '&:hover, &:focus': {
        color: theme.colors.primary,
    },

    '& a': {
        alignItems: 'center',
        alignSelf: 'stretch',
        display: 'inline-flex',
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'center',
    },

    variants: {
        isActive: {
            true: {
                color: theme.colors.primary,
            },
        },
    },
})

const Label = styled(Text, {
    color: theme.colors.darkGrey,
    marginTop: 4,
})

const ScanIconContainer = styled('div', {
    position: 'absolute',
    top: -39,
    width: 54,
    height: 54,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fediGradient: 'black',
    borderRadius: 1024,
    border: `3px solid ${theme.colors.white}`,
    color: theme.colors.white,
})

const ScanItem = styled('button', {
    alignItems: 'center',
    alignSelf: 'stretch',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    outline: 'none',
    paddingTop: 24,
    position: 'relative',
})
