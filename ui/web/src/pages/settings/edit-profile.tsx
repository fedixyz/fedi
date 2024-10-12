import { styled } from '@stitches/react'
import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import EditIcon from '@fedi/common/assets/svgs/edit.svg'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectHasSetMatrixDisplayName,
    selectMatrixAuth,
    setMatrixDisplayName,
    uploadAndSetMatrixAvatarUrl,
} from '@fedi/common/redux'

import { Avatar } from '../../components/Avatar'
import { CircularLoader } from '../../components/CircularLoader'
import { ContentBlock } from '../../components/ContentBlock'
import { Icon } from '../../components/Icon'
import { IconButton } from '../../components/IconButton'
import * as Layout from '../../components/Layout'
import { Text } from '../../components/Text'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint, writeBridgeFile } from '../../lib/bridge'
import { theme } from '../../styles'

const EditProfile = () => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const toast = useToast()

    const { replace } = useRouter()

    const matrixAuth = useAppSelector(selectMatrixAuth)
    const hasSetMatrixDisplayName = useAppSelector(
        selectHasSetMatrixDisplayName,
    )

    useEffect(() => {
        if (!hasSetMatrixDisplayName) {
            replace('/onboarding/username')
        }
    }, [hasSetMatrixDisplayName, replace])

    const [isChangingAvatar, setIsChangingAvatar] = useState<boolean>(false)
    const [isChangingName, setIsChangingName] = useState<boolean>(false)

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

    const handleDisplayNameChange = useCallback(async () => {
        try {
            setIsChangingName(true)

            const displayName = prompt(
                t('feature.onboarding.enter-username'),
                matrixAuth?.displayName,
            )

            if (!displayName) return
            if (displayName === matrixAuth?.displayName) return

            await dispatch(setMatrixDisplayName({ displayName })).unwrap()

            toast.show({
                content: t('phrases.changes-saved'),
                status: 'success',
            })
        } catch (err) {
            toast.error(t, 'errors.unknown-error')
        } finally {
            setIsChangingName(false)
        }
    }, [dispatch, matrixAuth?.displayName, t, toast])

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/settings">
                    <Layout.Title subheader>
                        {t('phrases.edit-profile')}
                    </Layout.Title>
                </Layout.Header>
                <Layout.Content>
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
                        <ChatIdentityName>
                            <Text variant="h2" weight="medium">
                                {matrixAuth?.displayName || ''}
                            </Text>
                            {isChangingName ? (
                                <EditNameLoading>
                                    <CircularLoader size="xs" />
                                </EditNameLoading>
                            ) : (
                                <IconButton
                                    icon={EditIcon}
                                    size="md"
                                    onClick={handleDisplayNameChange}
                                />
                            )}
                        </ChatIdentityName>
                    </ChatIdentity>
                </Layout.Content>
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
    display: 'flex',
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
    alignItems: 'center',
    gap: 4,
})

const EditNameLoading = styled('div', {
    width: 32,
})
export default EditProfile
