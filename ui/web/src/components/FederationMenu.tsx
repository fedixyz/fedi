import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import InviteMembersIcon from '@fedi/common/assets/svgs/invite-members.svg'
import LeaveFederationIcon from '@fedi/common/assets/svgs/leave-federation.svg'
import ScrollIcon from '@fedi/common/assets/svgs/scroll.svg'
import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import TableExportIcon from '@fedi/common/assets/svgs/table-export.svg'
import { useToast } from '@fedi/common/hooks/toast'
import { useExportTransactions } from '@fedi/common/hooks/transactions'
import { LoadedFederation } from '@fedi/common/types'
import {
    getFederationTosUrl,
    shouldShowInviteCode,
    shouldShowSocialRecovery,
} from '@fedi/common/utils/FederationUtils'

import { fedimint } from '../lib/bridge'
import { AccordionMenu, MenuItemInfo, MenuItemName } from './AccordionMenu'
import { FederationAvatar } from './FederationAvatar'
import { MenuGroup } from './SettingsMenu'

interface FederationMenuProps {
    federation: LoadedFederation
    onInviteMembers: (federationId: string) => void
    onLeaveFederation: (federation: LoadedFederation) => void
}

export const FederationMenu = ({
    federation,
    onInviteMembers,
    onLeaveFederation,
}: FederationMenuProps) => {
    const { t } = useTranslation()
    const toast = useToast()
    const [exportingFederationId, setExportingFederationId] =
        useState<string>('')

    const exportTransactions = useExportTransactions(
        fedimint,
        t,
        exportingFederationId,
    )

    const exportTransactionsAsCsv = async (fed: LoadedFederation) => {
        setExportingFederationId(fed.id)

        const res = await exportTransactions(fed)

        if (res.success) {
            const element = document.createElement('a')
            element.setAttribute('href', res.uri)
            element.setAttribute('download', res.fileName)

            document.body.appendChild(element)
            element.click()
            document.body.removeChild(element)
        } else {
            toast.error(t, res.message, 'errors.unknown-error')
        }

        setExportingFederationId('')
    }

    const tosUrl = getFederationTosUrl(federation.meta) || ''
    const shouldShowInvite = shouldShowInviteCode(federation.meta)

    const federationMenu: MenuGroup = {
        items: [
            {
                label: t('feature.federations.invite-members'),
                icon: InviteMembersIcon,
                onClick: () => onInviteMembers(federation.id),
                disabled: !shouldShowInvite,
            },
            {
                label: t('feature.backup.social-backup'),
                icon: SocialPeopleIcon,
                href: `/settings/backup/social#id=${federation.id}`,
                hidden: !shouldShowSocialRecovery(federation),
            },
            {
                label: t('feature.federations.federation-terms'),
                icon: ScrollIcon,
                href: tosUrl,
                disabled: !tosUrl,
            },
            {
                label: t('feature.backup.export-transactions-to-csv'),
                icon: TableExportIcon,
                onClick: () => exportTransactionsAsCsv(federation),
                disabled: !!exportingFederationId,
            },
            {
                label: t('feature.federations.leave-federation'),
                icon: LeaveFederationIcon,
                onClick: () => onLeaveFederation(federation),
            },
        ].filter(item => !item.hidden),
    }

    const header = (
        <MenuItemInfo>
            <FederationAvatar federation={federation} size="sm" />
            <MenuItemName>{federation.name}</MenuItemName>
        </MenuItemInfo>
    )

    return <AccordionMenu header={header} menu={federationMenu} />
}
