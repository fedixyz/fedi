import { styled } from '@stitches/react'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import EditIcon from '@fedi/common/assets/svgs/edit.svg'
import { useDisplayNameForm } from '@fedi/common/hooks/chat'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixAuth,
    uploadAndSetMatrixAvatarUrl,
} from '@fedi/common/redux'

import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { CircularLoader } from '../../components/CircularLoader'
import { ContentBlock } from '../../components/ContentBlock'
import { Icon } from '../../components/Icon'
import * as Layout from '../../components/Layout'
import { Text } from '../../components/Text'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint, writeBridgeFile } from '../../lib/bridge'
import { theme } from '../../styles'

const EditProfile = () => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const toast = useToast()

    const {
        username,
        isSubmitting,
        errorMessage,
        handleChangeUsername,
        handleSubmitDisplayName,
    } = useDisplayNameForm(t)

    const matrixAuth = useAppSelector(selectMatrixAuth)

    const [isChangingAvatar, setIsChangingAvatar] = useState<boolean>(false)

    const handleAvatarChange = useCallback(
        async (ev: React.ChangeEvent<HTMLInputElement>) => {
            const file = ev.target.files?.[0]
            if (!file) return

            try {
                setIsChangingAvatar(true)

                const path = 'chat-avatar'
                const mimeType = file.type
                const data = new Uint8Array(await file.arrayBuffer())

                await writeBridgeFile(path, data)

                await dispatch(
                    uploadAndSetMatrixAvatarUrl({ fedimint, path, mimeType }),
                ).unwrap()

                toast.show({
                    content: t('phrases.changes-saved'),
                    status: 'success',
                })
            } catch (err) {
                toast.error(t, 'errors.unknown-error')
            } finally {
                setIsChangingAvatar(false)
            }
        },
        [dispatch, t, toast],
    )

    const handleOnDisplayNameSave = async () => {
        handleSubmitDisplayName(() => {
            toast.show({
                content: t('phrases.changes-saved'),
                status: 'success',
            })
        })
    }

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/settings">
                    <Layout.Title subheader>
                        {t('phrases.edit-profile')}
                    </Layout.Title>
                </Layout.Header>

                <Layout.Content>
                    <Container>
                        <ChatAvatarContainer>
                            <Avatar
                                id={matrixAuth?.userId || ''}
                                name={matrixAuth?.displayName || ''}
                                src={matrixAuth?.avatarUrl}
                                size="lg"
                            />
                            <AvatarEdit isUploading={isChangingAvatar}>
                                <AvatarEditFileInput
                                    type="file"
                                    onChange={handleAvatarChange}
                                    accept="image/*, video/*"
                                    id="file-input"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                    multiple
                                />
                                {isChangingAvatar ? (
                                    <CircularLoader size="sm" />
                                ) : (
                                    <Icon icon={EditIcon} size="md" />
                                )}
                            </AvatarEdit>
                        </ChatAvatarContainer>
                        <Text
                            variant="small"
                            css={{ color: theme.colors.grey, marginTop: 10 }}>
                            {t('feature.chat.change-avatar')}
                        </Text>
                        <ChatIdentityName>
                            <InputLabel>
                                {t('feature.chat.display-name')}
                            </InputLabel>
                            <Input
                                type="text"
                                aria-label="Display name"
                                value={username}
                                onChange={e =>
                                    handleChangeUsername(e.currentTarget.value)
                                }
                            />
                            {errorMessage && (
                                <WarningText
                                    variant="small"
                                    css={{ color: theme.colors.red }}>
                                    {errorMessage}
                                </WarningText>
                            )}
                        </ChatIdentityName>
                    </Container>
                </Layout.Content>

                <Layout.Actions>
                    <Button
                        width="full"
                        loading={isSubmitting}
                        disabled={
                            isSubmitting ||
                            errorMessage !== null ||
                            username.trim() === matrixAuth?.displayName
                        }
                        onClick={handleOnDisplayNameSave}>
                        {t('words.save')}
                    </Button>
                </Layout.Actions>
            </Layout.Root>
        </ContentBlock>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px',
    borderRadius: 16,
    holoGradient: '400',
})

const ChatAvatarContainer = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
})

const AvatarEdit = styled('label', {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: '100%',
    opacity: 0,
    cursor: 'pointer',
    color: theme.colors.white,
    background: theme.colors.primary20,
    filter: `drop-shadow(1px 1px 2px ${theme.colors.primary20})`,
    transition: `opacity 100ms ease`,

    '&:hover': {
        opacity: 1,
    },
    variants: {
        isUploading: {
            true: {
                opacity: 1,
                pointerEvents: 'none',
            },
        },
    },
})

const AvatarEditFileInput = styled('input', {
    opacity: 0,
    position: 'absolute',
    zIndex: -1,
    top: 0,
    left: 0,
    width: 1,
    height: 1,
})

const ChatIdentityName = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 30,
    width: '100%',
})

const InputLabel = styled('label', {
    color: theme.colors.grey,
    fontSize: theme.fontSizes.small,
})

const Input = styled('input', {
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: '5px',
    padding: '5px',
    width: '100%',
})

const WarningText = styled(Text, {})

export default EditProfile
