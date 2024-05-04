import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import InviteMembersIcon from '@fedi/common/assets/svgs/invite-members.svg'
import LanguageIcon from '@fedi/common/assets/svgs/language.svg'
import LeaveFederationIcon from '@fedi/common/assets/svgs/leave-federation.svg'
import QRIcon from '@fedi/common/assets/svgs/qr.svg'
import ScrollIcon from '@fedi/common/assets/svgs/scroll.svg'
import TableExportIcon from '@fedi/common/assets/svgs/table-export.svg'
import UsdIcon from '@fedi/common/assets/svgs/usd.svg'
import WalletIcon from '@fedi/common/assets/svgs/wallet.svg'
import {
    useFederationSupportsSingleSeed,
    useIsInviteSupported,
} from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { useExportTransactions } from '@fedi/common/hooks/transactions'
import {
    leaveFederation,
    selectActiveFederation,
    selectAuthenticatedMember,
} from '@fedi/common/redux'
import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { Avatar } from '../../components/Avatar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ContentBlock } from '../../components/ContentBlock'
import { IconButton } from '../../components/IconButton'
import { InviteMemberDialog } from '../../components/InviteMemberDialog'
import * as Layout from '../../components/Layout'
import { MemberQRDialog } from '../../components/MemberQRDialog'
import { SettingsMenu, SettingsMenuProps } from '../../components/SettingsMenu'
import { Text } from '../../components/Text'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'

function AdminPage() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const member = useAppSelector(selectAuthenticatedMember)
    const activeFederation = useAppSelector(selectActiveFederation)
    const toast = useToast()
    const exportTransactions = useExportTransactions(fedimint)
    const [isMemberQrOpen, setIsMemberQrOpen] = useState(false)
    const [isInvitingMember, setIsInvitingMember] = useState(false)
    const [isLeavingFederation, setIsLeavingFederation] = useState(false)
    const [isExportingCSV, setIsExportingCSV] = useState(false)
    const isInviteSupported = useIsInviteSupported()
    const supportsSingleSeed = useFederationSupportsSingleSeed()

    const federationId = activeFederation?.id
    const balance = activeFederation?.balance
    const canLeaveFederation = typeof balance === 'number' && balance < 100_000

    const handleConfirmLeaveFederation = useCallback(async () => {
        if (!federationId) return
        if (canLeaveFederation) {
            try {
                await dispatch(leaveFederation({ fedimint, federationId }))
            } catch (err) {
                toast.error(t, err, 'errors.unknown-error')
                return
            }
        }
        setIsLeavingFederation(false)
    }, [canLeaveFederation, federationId, dispatch, toast, t])

    const tosUrl =
        (activeFederation && getFederationTosUrl(activeFederation.meta)) ||
        undefined

    const exportTransactionsAsCsv = async () => {
        setIsExportingCSV(true)

        const res = await exportTransactions()

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

        setIsExportingCSV(false)
    }

    let menu: SettingsMenuProps['menu'] = [
        {
            label: t('words.federation'),
            items: [
                {
                    label: t('feature.federations.federation-terms'),
                    icon: ScrollIcon,
                    href: tosUrl,
                    disabled: !tosUrl,
                },
                {
                    label: t('feature.federations.invite-members'),
                    icon: InviteMembersIcon,
                    onClick: () => setIsInvitingMember(true),
                    disabled: !isInviteSupported,
                },
                {
                    label: t('feature.federations.leave-federation'),
                    icon: LeaveFederationIcon,
                    onClick: () => setIsLeavingFederation(true),
                },
            ],
        },
        {
            label: 'words.wallet',
            items: [
                {
                    label: t('feature.backup.backup-wallet'),
                    icon: WalletIcon,
                    href: '/settings/backup',
                    hidden: !supportsSingleSeed,
                },
                {
                    label: t('feature.backup.export-transactions-to-csv'),
                    icon: TableExportIcon,
                    onClick: exportTransactionsAsCsv,
                    disabled: isExportingCSV,
                },
            ],
        },
        {
            label: t('words.general'),
            items: [
                {
                    label: t('words.language'),
                    icon: LanguageIcon,
                    href: '/settings/language',
                },
                {
                    label: t('phrases.display-currency'),
                    icon: UsdIcon,
                    href: '/settings/currency',
                },
            ],
        },
    ]
    // Filter out hidden items, filter out groups that have no items left.
    menu = menu
        .map(group => ({
            ...group,
            items: group.items.filter(item => !item.hidden),
        }))
        .filter(group => group.items.length > 0)

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header>
                    <Layout.Title>{t('words.settings')}</Layout.Title>
                    {!!member && (
                        <IconButton
                            icon={QRIcon}
                            size="md"
                            onClick={() => setIsMemberQrOpen(true)}
                        />
                    )}
                </Layout.Header>
                <Layout.Content>
                    <div>
                        {member && (
                            <MemberDetails>
                                <Avatar
                                    id={member.id}
                                    name={member.username}
                                    size="lg"
                                />
                                <Text variant="h2" weight="medium">
                                    {member.username}
                                </Text>
                            </MemberDetails>
                        )}
                        <SettingsMenu menu={menu} />
                    </div>
                </Layout.Content>
            </Layout.Root>

            <MemberQRDialog
                open={isMemberQrOpen}
                onOpenChange={setIsMemberQrOpen}
            />

            <InviteMemberDialog
                open={isInvitingMember}
                onOpenChange={setIsInvitingMember}
            />

            <ConfirmDialog
                open={isLeavingFederation}
                title={t('feature.federations.leave-federation')}
                description={t(
                    canLeaveFederation
                        ? 'feature.federations.leave-federation-confirmation'
                        : 'feature.federations.leave-federation-withdraw-first',
                )}
                onClose={() => setIsLeavingFederation(false)}
                onConfirm={handleConfirmLeaveFederation}
            />
        </ContentBlock>
    )
}

const MemberDetails = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: '24px 16px',
    borderRadius: 16,
    holoGradient: '400',
})

export default AdminPage
