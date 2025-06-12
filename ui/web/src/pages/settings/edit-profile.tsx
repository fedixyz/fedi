import { styled } from '@stitches/react'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import EditIcon from '@fedi/common/assets/svgs/edit.svg'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixAuth,
    setMatrixDisplayName,
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

    const matrixAuth = useAppSelector(selectMatrixAuth)

    const [isChangingAvatar, setIsChangingAvatar] = useState<boolean>(false)
    const [isChangingDisplayName, setIsChangingDisplayName] =
        useState<boolean>(false)
    const [displayName, setDisplayName] = useState<string>(
        matrixAuth?.displayName || '',
    )
    const [isDisabled, setIsDisabled] = useState<boolean>(true)

    useEffect(() => {
        if (
            isChangingDisplayName ||
            displayName.trim().length === 0 ||
            displayName.trim() === matrixAuth?.displayName
        ) {
            setIsDisabled(true)
        } else {
            setIsDisabled(false)
        }
    }, [displayName, isChangingDisplayName, matrixAuth?.displayName])

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

    const handleOnDisplayNameChange = (
        ev: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const value = ev.currentTarget.value
        setDisplayName(value)
    }

    const handleOnDisplayNameSave = async () => {
        try {
            setIsChangingDisplayName(true)

            await dispatch(
                setMatrixDisplayName({ displayName: displayName.trim() }),
            ).unwrap()
            toast.show({
                content: t('phrases.changes-saved'),
                status: 'success',
            })
        } catch (err) {
            toast.error(t, 'errors.unknown-error')
        } finally {
            setIsChangingDisplayName(false)
        }
    }

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/settings">
                    <Layout.Title subheader>
                        {t('phrases.edit-profile')}
                    </Layout.Title>
                </Layout.Header>
                <Layout.Content centered>
                    <ChatIdentity>
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
                            css={{ color: theme.colors.grey }}>
                            {t('feature.chat.change-avatar')}
                        </Text>
                        <ChatIdentityName>
                            <Input
                                type="text"
                                aria-label="Display name"
                                maxLength={20}
                                value={displayName}
                                onChange={handleOnDisplayNameChange}
                            />
                        </ChatIdentityName>
                    </ChatIdentity>
                </Layout.Content>
                <Layout.Actions>
                    <Button
                        width="full"
                        loading={isChangingDisplayName}
                        disabled={isDisabled}
                        onClick={handleOnDisplayNameSave}>
                        {t('words.save')}
                    </Button>
                </Layout.Actions>
            </Layout.Root>
        </ContentBlock>
    )
}

const ChatIdentity = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: '24px 16px',
    borderRadius: 16,
    holoGradient: '400',
})

const ChatAvatarContainer = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
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

const Input = styled('input', {
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: '5px',
    padding: '5px',
    textAlign: 'center',
})

const ChatIdentityName = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
})

export default EditProfile
