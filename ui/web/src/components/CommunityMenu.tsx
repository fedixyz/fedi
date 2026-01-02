import React from 'react'
import { useTranslation } from 'react-i18next'

import InviteMembersIcon from '@fedi/common/assets/svgs/invite-members.svg'
import LeaveFederationIcon from '@fedi/common/assets/svgs/leave-federation.svg'
import ScrollIcon from '@fedi/common/assets/svgs/scroll.svg'
import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import { useLeaveCommunity } from '@fedi/common/hooks/leave'
import { selectCommunityModsById } from '@fedi/common/redux'
import { Community } from '@fedi/common/types'
import {
    getFederationTosUrl,
    shouldShowInviteCode,
} from '@fedi/common/utils/FederationUtils'

import { useAppSelector } from '../hooks'
import { AccordionMenu, MenuItemInfo, MenuItemName } from './AccordionMenu'
import { FederationAvatar } from './FederationAvatar'
import { MenuGroup } from './SettingsMenu'

interface CommunityMenuProps {
    community: Community
    onInviteMembers: (communityId: string) => void
    onLeaveCommunity: (community: Community) => void
}

export const CommunityMenu = ({
    community,
    onInviteMembers,
    onLeaveCommunity,
}: CommunityMenuProps) => {
    const { t } = useTranslation()

    const communityMods = useAppSelector(state =>
        selectCommunityModsById(state, community.id),
    )
    const hasMods = communityMods.length > 0

    const { canLeaveCommunity } = useLeaveCommunity(community.id)

    const tosUrl = getFederationTosUrl(community.meta) || ''
    const shouldShowInvite = shouldShowInviteCode(community.meta)

    const communityMenu: MenuGroup = {
        items: [
            {
                label: t('feature.communities.community-details'),
                icon: ScrollIcon,
                // TODO: Add href when community details page exists
                disabled: true,
            },
            ...(hasMods
                ? [
                      {
                          label: t('feature.communities.community-mods'),
                          icon: SocialPeopleIcon,
                          // TODO: Add href when community mods page exists
                          disabled: true,
                      },
                  ]
                : []),
            {
                label: t('feature.federations.invite-members'),
                icon: InviteMembersIcon,
                onClick: () => onInviteMembers(community.id),
                disabled: !shouldShowInvite,
            },
            {
                label: t('feature.communities.community-terms'),
                icon: ScrollIcon,
                href: tosUrl,
                disabled: !tosUrl,
            },
            ...(canLeaveCommunity
                ? [
                      {
                          label: t('feature.communities.leave-community'),
                          icon: LeaveFederationIcon,
                          onClick: () => onLeaveCommunity(community),
                      },
                  ]
                : []),
        ],
    }

    const header = (
        <MenuItemInfo>
            <FederationAvatar federation={community} size="sm" />
            <MenuItemName>{community.name}</MenuItemName>
        </MenuItemInfo>
    )

    return <AccordionMenu header={header} menu={communityMenu} />
}
