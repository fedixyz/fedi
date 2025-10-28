import Link from 'next/link'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ChevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import PlusIcon from '@fedi/common/assets/svgs/plus.svg'
import ScanIcon from '@fedi/common/assets/svgs/scan.svg'
import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectMatrixChatsList } from '@fedi/common/redux'

import * as Layout from '../../components/Layout'
import { useAppSelector, useMediaQuery } from '../../hooks'
import { config, styled, theme } from '../../styles'
import { ContentBlock } from '../ContentBlock'
import { Dialog } from '../Dialog'
import { Column, Row } from '../Flex'
import { Icon } from '../Icon'
import MainHeaderButtons, { BubbleButton } from '../MainHeaderButtons'
import { Popover } from '../Popover'
import { Text } from '../Text'
import { ChatListItem } from './ChatListItem'

interface Props {
    children: React.ReactNode
    isShowingContent: boolean
}

export const ChatBlock: React.FC<Props> = ({ children, isShowingContent }) => {
    const { t } = useTranslation()
    const rooms = useAppSelector(selectMatrixChatsList)
    const isSm = useMediaQuery(config.media.sm)

    const [optionsOverlayOpen, setOptionsOverlayOpen] = useState(false)

    const optionsContent = useCallback(() => {
        return (
            <Column gap="lg">
                <ChatAddOption
                    href="/chat/new/room"
                    text={t('feature.chat.create-a-group')}
                    icon={SocialPeopleIcon}
                />
                <ChatAddOption
                    href="/scan"
                    text={t('phrases.scan-or-paste')}
                    icon={ScanIcon}
                />
            </Column>
        )
    }, [t])

    return (
        <ContentBlock css={{ maxWidth: 840, padding: 0 }}>
            <Container>
                <Sidebar isHidden={isShowingContent}>
                    <Layout.Root>
                        <SidebarHeader>
                            <Layout.Title small>{t('words.chat')}</Layout.Title>

                            {isSm ? (
                                <>
                                    <MainHeaderButtons
                                        onAddPress={() =>
                                            setOptionsOverlayOpen(true)
                                        }
                                    />
                                    <Dialog
                                        mobileDismiss="overlay"
                                        onOpenChange={setOptionsOverlayOpen}
                                        open={optionsOverlayOpen}
                                        hideCloseButton>
                                        {optionsContent()}
                                    </Dialog>
                                </>
                            ) : (
                                <Row align="center" gap="md">
                                    <Popover content={optionsContent()}>
                                        <BubbleButton>
                                            <Icon icon={PlusIcon} size="sm" />
                                        </BubbleButton>
                                    </Popover>
                                    <MainHeaderButtons />
                                </Row>
                            )}
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
        </ContentBlock>
    )
}

function ChatAddOption({
    href,
    text,
    icon,
}: {
    href: string
    icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>
    text: string
}) {
    return (
        <Link href={href}>
            <Row align="center" justify="between">
                <Row align="center" gap="md">
                    <OptionIcon>
                        <Icon
                            icon={icon}
                            size={24}
                            color={theme.colors.white.toString()}
                        />
                    </OptionIcon>
                    <Text weight="medium">{text}</Text>
                </Row>
                <Icon
                    icon={ChevronRightIcon}
                    size={24}
                    color={theme.colors.grey.toString()}
                />
            </Row>
        </Link>
    )
}

const OptionIcon = styled('div', {
    width: 40,
    height: 40,
    borderRadius: 12,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fediGradient: 'black',
})

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
                    display: 'none',
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
        padding: 0,
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
        display: 'none',
    },

    variants: {
        isShowing: {
            true: {
                '@sm': {
                    display: 'flex',
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
