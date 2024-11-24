import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import BugIcon from '@fedi/common/assets/svgs/bug.svg'
import InviteMembersIcon from '@fedi/common/assets/svgs/invite-members.svg'
import LanguageIcon from '@fedi/common/assets/svgs/language.svg'
import LeaveFederationIcon from '@fedi/common/assets/svgs/leave-federation.svg'
import NoteIcon from '@fedi/common/assets/svgs/note.svg'
import ScrollIcon from '@fedi/common/assets/svgs/scroll.svg'
import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import TableExportIcon from '@fedi/common/assets/svgs/table-export.svg'
import UsdIcon from '@fedi/common/assets/svgs/usd.svg'
import UserIcon from '@fedi/common/assets/svgs/user.svg'
import { useIsInviteSupported } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { useExportTransactions } from '@fedi/common/hooks/transactions'
import {
    leaveFederation,
    selectAlphabeticallySortedFederations,
    selectFederation,
    selectHasSetMatrixDisplayName,
    selectMatrixAuth,
    setActiveFederationId,
} from '@fedi/common/redux'
import { FederationListItem, LoadedFederation } from '@fedi/common/types'
import {
    getFederationTosUrl,
    supportsSingleSeed,
} from '@fedi/common/utils/FederationUtils'
import { encodeFediMatrixUserUri } from '@fedi/common/utils/matrix'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ContentBlock } from '../../components/ContentBlock'
import { CopyInput } from '../../components/CopyInput'
import { InviteMemberDialog } from '../../components/InviteMemberDialog'
import * as Layout from '../../components/Layout'
import { QRCode } from '../../components/QRCode'
import {
    MenuGroup,
    SettingsMenu,
    SettingsMenuProps,
} from '../../components/SettingsMenu'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'

const canLeaveFederation = (federation: FederationListItem | undefined) => {
    return (
        federation?.hasWallet &&
        'balance' in federation &&
        federation?.balance &&
        federation.balance < 100_000
    )
}

function AdminPage() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const hasSetMatrixDisplayName = useAppSelector(
        selectHasSetMatrixDisplayName,
    )

    const isInviteSupported = useIsInviteSupported()
    const exportTransactions = useExportTransactions(fedimint)

    const toast = useToast()

    const [invitingFederationId, setInvitingFederationId] = useState<string>('')
    const [leavingFederationId, setLeavingFederationId] = useState<string>('')
    const [exportingFederationId, setExportingFederationId] =
        useState<string>('')

    const leavingFederation = useAppSelector(s =>
        selectFederation(s, leavingFederationId),
    )

    const handleConfirmLeaveFederation = useCallback(async () => {
        if (!leavingFederation) return

        if (canLeaveFederation(leavingFederation)) {
            try {
                await dispatch(
                    leaveFederation({
                        fedimint,
                        federationId: leavingFederation.id,
                    }),
                )
            } catch (err) {
                toast.error(t, err, 'errors.unknown-error')
            }
        }

        setLeavingFederationId('')
    }, [leavingFederation, dispatch, toast, t])

    const exportTransactionsAsCsv = async (federation: LoadedFederation) => {
        setExportingFederationId(federation.id)

        const res = await exportTransactions(federation)

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

    const sortedFederations = useAppSelector(
        selectAlphabeticallySortedFederations,
    )

    const federationMenus: MenuGroup[] = sortedFederations.map(federation => {
        const tosUrl = getFederationTosUrl(federation.meta) || ''

        return {
            label: federation.name,
            items: [
                {
                    label: t('feature.federations.invite-members'),
                    icon: InviteMembersIcon,
                    onClick: () => setInvitingFederationId(federation.id),
                    disabled: !isInviteSupported,
                },
                {
                    label: t('feature.backup.social-backup'),
                    icon: SocialPeopleIcon,
                    href: `/settings/backup/social`,
                    onClick: () =>
                        dispatch(setActiveFederationId(federation.id)),
                    hidden: !supportsSingleSeed(federation),
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
                    onClick: () =>
                        federation.hasWallet
                            ? exportTransactionsAsCsv(federation)
                            : undefined,
                    disabled: !federation.hasWallet || !!exportingFederationId,
                },
                {
                    label: t('feature.federations.leave-federation'),
                    icon: LeaveFederationIcon,
                    onClick: () => setLeavingFederationId(federation.id),
                },
            ],
        }
    })

    let menu: SettingsMenuProps['menu'] = [
        {
            label: t('words.general'),
            items: [
                {
                    label: t('phrases.edit-profile'),
                    icon: UserIcon,
                    href: '/settings/edit-profile',
                    hidden: !hasSetMatrixDisplayName,
                },
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
                {
                    label: t('feature.backup.personal-backup'),
                    icon: NoteIcon,
                    href: `/settings/backup/personal`,
                },
                {
                    label: t('feature.bug.report-a-bug'),
                    icon: BugIcon,
                    href: `/bug-report`,
                },
            ],
        },
        ...federationMenus,
    ]

    // Filter out hidden items, filter out groups that have no items left.
    menu = menu
        .map(group => ({
            ...group,
            items: group.items.filter(item => !item.hidden),
        }))
        .filter(group => group.items.length > 0)

    const directChatLink = matrixAuth
        ? encodeFediMatrixUserUri(matrixAuth.userId)
        : ''

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header>
                    <Layout.Title>{t('words.account')}</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <div>
                        {hasSetMatrixDisplayName && (
                            <Content>
                                <QRContainer>
                                    <QRCode
                                        data={directChatLink}
                                        logoOverrideUrl={matrixAuth?.avatarUrl}
                                    />
                                    <CopyInput
                                        value={directChatLink}
                                        onCopyMessage={t(
                                            'phrases.copied-to-clipboard',
                                        )}
                                    />
                                    <Layout.Title small>
                                        {matrixAuth?.displayName}
                                    </Layout.Title>
                                </QRContainer>
                            </Content>
                        )}
                        <SettingsMenu menu={menu} />
                    </div>
                </Layout.Content>
            </Layout.Root>

            <InviteMemberDialog
                open={!!invitingFederationId}
                federationId={invitingFederationId}
                onClose={() => setInvitingFederationId('')}
            />

            <ConfirmDialog
                open={!!leavingFederationId}
                title={`${t('feature.federations.leave-federation')} - ${
                    leavingFederation?.name
                }`}
                description={t(
                    canLeaveFederation(leavingFederation)
                        ? 'feature.federations.leave-federation-confirmation'
                        : 'feature.federations.leave-federation-withdraw-first',
                )}
                onClose={() => setLeavingFederationId('')}
                onConfirm={handleConfirmLeaveFederation}
            />
        </ContentBlock>
    )
}

const Content = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 16,
    gap: 16,
})

const QRContainer = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
})

export default AdminPage
