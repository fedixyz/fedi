import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useCreateMatrixRoom } from '@fedi/common/hooks/matrix'
import { MatrixRoom } from '@fedi/common/types'

import { chatRoomRoute } from '../../constants/routes'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Column } from '../Flex'
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
        isPublic,
        setIsPublic,
    } = useCreateMatrixRoom(t, (roomId: MatrixRoom['id']) => {
        push(chatRoomRoute(roomId))
    })

    return (
        <Column grow>
            <Layout.Header back>
                <Layout.Title subheader>
                    {t('feature.chat.create-a-group')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Column gap="md" align="center">
                    <ChatAvatar
                        size="lg"
                        room={{
                            id: 'fake-room-id',
                            name: groupName,
                            broadcastOnly: broadcastOnly,
                            avatarUrl: null,
                            directUserId: null,
                            isDirect: false,
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
                        <WarningText variant="caption">
                            {errorMessage}
                        </WarningText>
                    )}
                    <SwitchContainer>
                        <Text>{t('feature.chat.broadcast-only')}</Text>
                        <Switch
                            checked={broadcastOnly}
                            onCheckedChange={setBroadcastOnly}
                        />
                    </SwitchContainer>
                    <SwitchContainer>
                        <Text>{t('words.public')}</Text>
                        <Switch
                            checked={isPublic}
                            onCheckedChange={value => {
                                setIsPublic(value)
                            }}
                        />
                    </SwitchContainer>
                    {isPublic && (
                        <WarningText>
                            {t('feature.chat.public-group-warning')}
                        </WarningText>
                    )}
                </Column>
            </Layout.Content>
            <Layout.Actions>
                <Button
                    width="full"
                    loading={isCreatingGroup}
                    onClick={handleCreateGroup}
                    disabled={!groupName || isCreatingGroup || !!errorMessage}>
                    {t('feature.chat.create-group')}
                </Button>
            </Layout.Actions>
        </Column>
    )
}

const SwitchContainer = styled('div', {
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
