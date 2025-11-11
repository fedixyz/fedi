import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useCreateMatrixRoom } from '@fedi/common/hooks/matrix'
import { MatrixRoom } from '@fedi/common/types'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Input } from '../Input'
import * as Layout from '../Layout'
import { Switch } from '../Switch'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'

export const ChatCreateRoom: React.FC = () => {
    const { t } = useTranslation()
    const { push } = useRouter()

    const {
        errorMessage,
        handleCreateGroup,
        isCreatingGroup,
        groupName,
        setGroupName,
        broadcastOnly,
        setBroadcastOnly,
    } = useCreateMatrixRoom(t, (roomId: MatrixRoom['id']) => {
        push(`/chat/room/${roomId}`)
    })

    return (
        <Container>
            <Layout.Header back>
                <Layout.Title subheader>
                    {t('feature.chat.create-a-group')}
                </Layout.Title>
            </Layout.Header>
            <Inner>
                <ChatAvatar
                    size="lg"
                    room={{
                        id: 'fake-room-id',
                        name: groupName,
                        broadcastOnly: broadcastOnly,
                        avatarUrl: null,
                        directUserId: null,
                    }}
                />
                <Input
                    label={t('feature.chat.group-name')}
                    value={groupName}
                    onChange={ev => setGroupName(ev.currentTarget.value)}
                    maxLength={30}
                    placeholder={t('feature.chat.new-group')}
                />
                {errorMessage && (
                    <WarningText variant="caption">{errorMessage}</WarningText>
                )}
                <BroadcastSwitchContainer>
                    <Text>{t('feature.chat.broadcast-only')}</Text>
                    <Switch
                        checked={broadcastOnly}
                        onCheckedChange={setBroadcastOnly}
                    />
                </BroadcastSwitchContainer>
            </Inner>
            <Buttons>
                <Button
                    width="full"
                    loading={isCreatingGroup}
                    onClick={handleCreateGroup}
                    disabled={!groupName || isCreatingGroup || !!errorMessage}>
                    {t('feature.chat.create-group')}
                </Button>
            </Buttons>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    position: 'relative',
})

const Inner = styled('div', {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    gap: 16,
    padding: 24,
})

const Buttons = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: 8,
    padding: 24,
})

const BroadcastSwitchContainer = styled('div', {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 8,
})

const WarningText = styled(Text, {
    color: theme.colors.red,
    alignSelf: 'flex-start',
})
