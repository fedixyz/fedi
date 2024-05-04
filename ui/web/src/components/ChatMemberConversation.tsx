import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import WalletIcon from '@fedi/common/assets/svgs/wallet.svg'
import {
    fetchChatMember,
    selectActiveFederationId,
    selectAuthenticatedMember,
    selectChatClientStatus,
    selectChatMember,
    selectChatMessages,
    sendDirectMessage,
} from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled } from '../styles'
import { Button } from './Button'
import { ChatConversation } from './ChatConversation'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatPaymentDialog } from './ChatPaymentDialog'
import { HoloLoader } from './HoloLoader'
import { IconButton } from './IconButton'
import { Text } from './Text'

interface Props {
    memberId: string
}

export const ChatMemberConversation: React.FC<Props> = ({ memberId }) => {
    const { t } = useTranslation()
    const { back, replace, query } = useRouter()
    const dispatch = useAppDispatch()
    const federationId = useAppSelector(selectActiveFederationId)
    const member = useAppSelector(s => selectChatMember(s, memberId))
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const messages = useAppSelector(s => selectChatMessages(s, memberId))
    const isChatOnline = useAppSelector(selectChatClientStatus) === 'online'
    const [isLoading, setIsLoading] = useState(!member)
    const [isPaymentOpen, setIsPaymentOpen] = useState(query.action === 'send')

    useEffect(() => {
        if (memberId === authenticatedMember?.id) {
            replace('/chat')
        }
    }, [memberId, authenticatedMember?.id, replace])

    // If we don't have info about this member, attempt to fetch a pubkey for them
    useEffect(() => {
        if (!isChatOnline) {
            setIsLoading(false)
            return
        }
        if (member || !federationId) return
        setIsLoading(true)
        dispatch(fetchChatMember({ federationId, memberId }))
            .catch(() => {
                /* no-op */
            })
            .finally(() => setIsLoading(false))
    }, [member, memberId, federationId, isChatOnline, dispatch])

    const handleSend = useCallback(
        async (content: string) => {
            if (!federationId) throw new Error('errors.unknown-error')
            // No need for try / catch, ChatConversation handles errors
            await dispatch(
                sendDirectMessage({
                    fedimint,
                    federationId,
                    recipientId: memberId,
                    content,
                }),
            ).unwrap()
        },
        [dispatch, federationId, memberId],
    )

    if (isLoading) {
        return (
            <LoadingContainer>
                <HoloLoader size="xl" />
            </LoadingContainer>
        )
    } else if (!member) {
        return (
            <ChatEmptyState>
                <Text>
                    {t('feature.chat.member-not-found', {
                        username: memberId.split('@')[0],
                    })}
                </Text>
                <Button onClick={() => back()}>{t('phrases.go-back')}</Button>
            </ChatEmptyState>
        )
    }

    return (
        <>
            <ChatConversation
                type={ChatType.direct}
                id={member?.id || ''}
                name={member?.username || ''}
                messages={messages}
                onSendMessage={handleSend}
                inputActions={
                    <IconButton
                        size="md"
                        icon={WalletIcon}
                        onClick={() => setIsPaymentOpen(true)}
                    />
                }
            />
            <ChatPaymentDialog
                recipientId={memberId}
                open={isPaymentOpen}
                onOpenChange={setIsPaymentOpen}
            />
        </>
    )
}

const LoadingContainer = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
})
