import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useExportTransactions } from '@fedi/common/hooks/transactions'
import { selectAuthenticatedGuardian } from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'
import {
    getFederationTosUrl,
    shouldShowInviteCode,
    shouldShowSocialRecovery,
} from '@fedi/common/utils/FederationUtils'

import {
    settingsBackupSocialRoute,
    settingsStartRecoveryAssistRoute,
} from '../constants/routes'
import { useAppSelector } from '../hooks'
import { AccordionMenu, MenuItemInfo, MenuItemName } from './AccordionMenu'
import { FederationAvatar } from './FederationAvatar'
import { SvgIconName } from './Icon'
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

    const authenticatedGuardian = useAppSelector(selectAuthenticatedGuardian)

    const exportTransactions = useExportTransactions(t, exportingFederationId)

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
                label: t('feature.recovery.guardian-access'),
                icon: 'SocialPeople' as SvgIconName,
                href: settingsStartRecoveryAssistRoute,
                hidden: authenticatedGuardian?.federationId !== federation.id,
            },
            {
                label: t('feature.federations.invite-members'),
                icon: 'InviteMembers' as SvgIconName,
                onClick: () => onInviteMembers(federation.id),
                disabled: !shouldShowInvite,
            },
            {
                label: t('feature.backup.social-backup'),
                icon: 'SocialPeople' as SvgIconName,
                href: `${settingsBackupSocialRoute}#id=${federation.id}`,
                hidden: !shouldShowSocialRecovery(federation),
            },
            {
                label: t('phrases.terms-and-conditions'),
                icon: 'Scroll' as SvgIconName,
                href: tosUrl,
                disabled: !tosUrl,
            },
            {
                label: t('feature.backup.export-transactions-to-csv'),
                icon: 'TableExport' as SvgIconName,
                onClick: () => exportTransactionsAsCsv(federation),
                disabled: !!exportingFederationId,
            },
            {
                label: t('feature.federations.leave-federation'),
                icon: 'LeaveFederation' as SvgIconName,
                onClick: () => onLeaveFederation(federation),
            },
        ].filter(item => !('hidden' in item) || !item.hidden),
    }

    const header = (
        <MenuItemInfo>
            <FederationAvatar federation={federation} size="sm" />
            <MenuItemName>{federation.name}</MenuItemName>
        </MenuItemInfo>
    )

    return <AccordionMenu header={header} menu={federationMenu} />
}
