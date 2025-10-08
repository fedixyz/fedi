import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    selectCommunities,
    setLastSelectedCommunityId,
} from '@fedi/common/redux'
import { Community } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../hooks'
import { styled } from '../styles'
import CommunityTile from './CommunityTile'
import { Dialog } from './Dialog'
import { InviteMemberDialog } from './InviteMemberDialog'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export const CommunitiesOverlay: React.FC<Props> = ({ onOpenChange, open }) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const communities = useAppSelector(selectCommunities)
    const [invitingCommunityId, setInvitingCommunityId] = useState('')

    const handleTilePress = (c: Community) => {
        dispatch(setLastSelectedCommunityId(c.id))
        onOpenChange(false)
    }

    const handleQrPress = (c: Community) => {
        setInvitingCommunityId(c.id)
    }

    return (
        <>
            <Dialog
                title={t('words.communities')}
                open={open}
                onOpenChange={onOpenChange}
                size="md">
                <Content>
                    <CommunitiesList>
                        {communities.map((c, i) => (
                            <CommunityTile
                                key={`community-${i}`}
                                community={c}
                                onSelect={() => handleTilePress(c)}
                                onSelectQr={() => handleQrPress(c)}
                            />
                        ))}
                    </CommunitiesList>
                </Content>
            </Dialog>

            <InviteMemberDialog
                open={!!invitingCommunityId}
                federationId={invitingCommunityId}
                onClose={() => setInvitingCommunityId('')}
            />
        </>
    )
}

const Content = styled('div', {
    padding: '16px 0',
    maxHeight: '60vh',
    overflow: 'auto',
})

const CommunitiesList = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
})

export default CommunitiesOverlay
