import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import QRIcon from '@fedi/common/assets/svgs/qr.svg'
import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectMatrixChatsList } from '@fedi/common/redux'

import * as Layout from '../components/Layout'
import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Button } from './Button'
import { ChatListItem } from './ChatListItem'
import { ChatUserQRDialog } from './ChatUserQRDialog'
import { ContentBlock } from './ContentBlock'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { Text } from './Text'

interface Props {
    children: React.ReactNode
    isShowingContent: boolean
}

export const ChatBlock: React.FC<Props> = ({ children, isShowingContent }) => {
    const { t } = useTranslation()
    const rooms = useAppSelector(selectMatrixChatsList)

    const [isMemberQrOpen, setIsMemberQrOpen] = useState(false)

    return (
        <ContentBlock css={{ maxWidth: 840, padding: 0 }}>
            <Container>
                <Sidebar isHidden={isShowingContent}>
                    <Layout.Root>
                        <SidebarHeader>
                            <Layout.Title small>{t('words.chat')}</Layout.Title>
                            <IconButton
                                icon={QRIcon}
                                onClick={() => setIsMemberQrOpen(true)}
                                size="md"
                            />
                        </SidebarHeader>
                        <Layout.Content fullWidth>
                            <SidebarList>
                                {rooms.map(room => (
                                    <ErrorBoundary
                                        key={room.id}
                                        fallback={null}>
                                        <ChatListItem room={room} />
                                    </ErrorBoundary>
                                ))}
                            </SidebarList>
                            <NewChatAction>
                                <Button href="/chat/new" width="full">
                                    {t('feature.chat.new-chat')}
                                </Button>
                            </NewChatAction>
                        </Layout.Content>
                    </Layout.Root>
                </Sidebar>
                <Content isShowing={isShowingContent}>
                    <ErrorBoundary
                        fallback={
                            <Error>
                                <Icon icon={ErrorIcon} />
                                <Text variant="h2" weight="normal">
                                    {t('errors.unknown-error')}
                                </Text>
                            </Error>
                        }>
                        {children}
                    </ErrorBoundary>
                </Content>
            </Container>
            <ChatUserQRDialog
                open={isMemberQrOpen}
                onOpenChange={setIsMemberQrOpen}
            />
        </ContentBlock>
    )
}

const Container = styled('div', {
    position: 'relative',
    display: 'flex',
    minHeight: 300,
    height: 'calc(100vh - 200px)',
    overflow: 'hidden',

    '@md': {
        height: 'calc(100vh - 240px)',
    },

    '@sm': {
        height: 'auto',
        flex: 1,
    },
})

const Sidebar = styled('div', {
    display: 'flex',
    flexShrink: 0,
    flexDirection: 'column',
    width: 280,
    borderRight: `1px solid ${theme.colors.extraLightGrey}`,

    '@sm': {
        width: '100%',
        border: 'none',
    },

    variants: {
        isHidden: {
            true: {
                '@sm': {
                    transform: 'translateX(-100vw)',
                },
            },
        },
    },
})

const SidebarHeader = styled(Layout.Header, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',

    '@sm': {
        padding: '16px 16px',
    },
})

const SidebarList = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
})

const Content = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',

    '@sm': {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        transform: 'translateX(100vw)',
    },

    variants: {
        isShowing: {
            true: {
                '@sm': {
                    transform: 'translateX(0)',
                },
            },
        },
    },
})

const Error = styled('div', {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 8,
    color: theme.colors.red,
})

const NewChatAction = styled('div', {
    padding: 12,
})
