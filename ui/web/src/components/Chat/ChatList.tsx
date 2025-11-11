import Link from 'next/link'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ChevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import ScanIcon from '@fedi/common/assets/svgs/scan.svg'
import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectMatrixChatsList } from '@fedi/common/redux'

import * as Layout from '../../components/Layout'
import { chatNewRoomRoute, scanRoute } from '../../constants/routes'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { Dialog } from '../Dialog'
import { Column, Row } from '../Flex'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { ChatListItem } from './ChatListItem'

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

export const ChatList: React.FC = () => {
    const { t } = useTranslation()
    const rooms = useAppSelector(selectMatrixChatsList)

    const [showOverlay, setShowOverlay] = useState(false)

    const optionsContent = useCallback(() => {
        return (
            <Column gap="lg">
                <ChatAddOption
                    href={chatNewRoomRoute}
                    text={t('feature.chat.create-a-group')}
                    icon={SocialPeopleIcon}
                />
                <ChatAddOption
                    href={scanRoute}
                    text={t('phrases.scan-or-paste')}
                    icon={ScanIcon}
                />
            </Column>
        )
    }, [t])

    return (
        <>
            <Layout.Root>
                <Layout.PageHeader
                    title={t('words.chat')}
                    onAddPress={() => setShowOverlay(true)}
                />
                <Layout.Content fullWidth>
                    {rooms.length === 0 ? (
                        <EmptyMessage>
                            {t('feature.chat.select-or-start')}
                        </EmptyMessage>
                    ) : (
                        <Chats>
                            {rooms.map(room => (
                                <ErrorBoundary key={room.id} fallback={null}>
                                    <ChatListItem room={room} />
                                </ErrorBoundary>
                            ))}
                        </Chats>
                    )}
                </Layout.Content>
            </Layout.Root>

            <Dialog
                mobileDismiss="overlay"
                onOpenChange={setShowOverlay}
                open={showOverlay}
                hideCloseButton>
                {optionsContent()}
            </Dialog>
        </>
    )
}

const Chats = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
})

const EmptyMessage = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    height: '100%',
    padding: 24,
    color: theme.colors.darkGrey,
})

const OptionIcon = styled('div', {
    width: 40,
    height: 40,
    borderRadius: 12,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fediGradient: 'black',
})
