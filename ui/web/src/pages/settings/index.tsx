import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import LanguageIcon from '@fedi/common/assets/svgs/language.svg'
import NostrIcon from '@fedi/common/assets/svgs/nostr.svg'
import NoteIcon from '@fedi/common/assets/svgs/note.svg'
import SettingsIcon from '@fedi/common/assets/svgs/settings.svg'
import UsdIcon from '@fedi/common/assets/svgs/usd.svg'
import UserIcon from '@fedi/common/assets/svgs/user.svg'
import { useLeaveCommunity, useLeaveFederation } from '@fedi/common/hooks/leave'
import {
    selectAlphabeticallySortedCommunities,
    selectAlphabeticallySortedFederations,
    selectMatrixAuth,
} from '@fedi/common/redux'
import { Community, LoadedFederation } from '@fedi/common/types'
import { encodeFediMatrixUserUri } from '@fedi/common/utils/matrix'

import { CommunityInviteDialog } from '../../components/CommunityInviteDialog'
import { CommunityMenu } from '../../components/CommunityMenu'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ContentBlock } from '../../components/ContentBlock'
import { CopyInput } from '../../components/CopyInput'
import { FederationInviteDialog } from '../../components/FederationInviteDialog'
import { FederationMenu } from '../../components/FederationMenu'
import * as Layout from '../../components/Layout'
import { MobileAppDownloadBanner } from '../../components/MobileAppDownloadBanner'
import { QRCode } from '../../components/QRCode'
import { SettingsMenu, SettingsMenuProps } from '../../components/SettingsMenu'
import { Text } from '../../components/Text'
import { VersionContainer } from '../../components/VersionContainer'
import { useAppSelector, useDeviceQuery } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'

function AdminPage() {
    const { t } = useTranslation()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const { isMobile } = useDeviceQuery()

    const [invitingFederationId, setInvitingFederationId] = useState<string>('')
    const [invitingCommunityId, setInvitingCommunityId] = useState<string>('')
    const [leavingFederation, setLeavingFederation] =
        useState<LoadedFederation | null>(null)
    const [leavingCommunity, setLeavingCommunity] = useState<Community | null>(
        null,
    )

    const { validateCanLeaveFederation, handleLeaveFederation } =
        useLeaveFederation({
            t,
            fedimint,
            federationId: leavingFederation?.id || '',
        })

    const { canLeaveCommunity, handleLeave } = useLeaveCommunity({
        t,
        fedimint,
        communityId: leavingCommunity?.id || '',
    })

    const handleLeaveFederationPressed = (federation: LoadedFederation) => {
        if (validateCanLeaveFederation(federation)) {
            setLeavingFederation(federation)
        }
    }

    const handleLeaveCommunityPressed = (community: Community) => {
        if (canLeaveCommunity) {
            setLeavingCommunity(community)
        }
    }

    const handleConfirmLeaveFederation = () => {
        if (leavingFederation) {
            handleLeaveFederation()
            setLeavingFederation(null)
        }
    }

    const handleConfirmLeaveCommunity = () => {
        if (leavingCommunity) {
            handleLeave()
            setLeavingCommunity(null)
        }
    }

    const sortedFederations = useAppSelector(
        selectAlphabeticallySortedFederations,
    )
    const sortedCommunities = useAppSelector(
        selectAlphabeticallySortedCommunities,
    )

    let menu: SettingsMenuProps['menu'] = [
        {
            label: t('words.general'),
            items: [
                {
                    label: t('phrases.edit-profile'),
                    icon: UserIcon,
                    href: '/settings/edit-profile',
                    hidden: !matrixAuth,
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
                    label: t('feature.nostr.nostr-settings'),
                    icon: NostrIcon,
                    href: `/settings/nostr`,
                },
                {
                    label: t('feature.settings.app-settings'),
                    icon: SettingsIcon,
                    href: `/settings/app`,
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

    const directChatLink = matrixAuth
        ? encodeFediMatrixUserUri(matrixAuth.userId)
        : ''

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header showCloseButton>
                    <Layout.Title>{t('words.account')}</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <div>
                        {matrixAuth && (
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
                        {isMobile && <MobileAppDownloadBanner />}
                        <SettingsMenu menu={menu} />

                        {/* Federations Section */}
                        {sortedFederations.length > 0 && (
                            <div>
                                <Text css={{ marginBottom: 16 }}>
                                    {t('words.federations')}
                                </Text>
                                {sortedFederations.map(federation => (
                                    <FederationMenu
                                        key={federation.id}
                                        federation={federation}
                                        onInviteMembers={
                                            setInvitingFederationId
                                        }
                                        onLeaveFederation={
                                            handleLeaveFederationPressed
                                        }
                                    />
                                ))}
                            </div>
                        )}

                        {/* Communities Section */}
                        {sortedCommunities.length > 0 && (
                            <div>
                                <Text css={{ marginBottom: 16 }}>
                                    {t('words.communities')}
                                </Text>
                                {sortedCommunities.map(community => (
                                    <CommunityMenu
                                        key={community.id}
                                        community={community}
                                        onInviteMembers={setInvitingCommunityId}
                                        onLeaveCommunity={
                                            handleLeaveCommunityPressed
                                        }
                                    />
                                ))}
                            </div>
                        )}

                        <VersionContainer />
                    </div>
                </Layout.Content>
            </Layout.Root>

            <FederationInviteDialog
                open={!!invitingFederationId}
                federationId={invitingFederationId}
                onClose={() => setInvitingFederationId('')}
            />

            <CommunityInviteDialog
                open={!!invitingCommunityId}
                communityId={invitingCommunityId}
                onClose={() => setInvitingCommunityId('')}
            />

            {leavingFederation && (
                <ConfirmDialog
                    open={!!leavingFederation}
                    title={`${t('feature.federations.leave-federation')} - ${leavingFederation.name}`}
                    description={t(
                        'feature.federations.leave-federation-confirmation',
                    )}
                    onConfirm={handleConfirmLeaveFederation}
                    onClose={() => setLeavingFederation(null)}
                    primaryButtonLabel={t('words.okay')}
                />
            )}

            {leavingCommunity && (
                <ConfirmDialog
                    open={!!leavingCommunity}
                    title={`${t('feature.communities.leave-community')} - ${leavingCommunity.name}`}
                    description={t(
                        'feature.federations.leave-community-confirmation',
                    )}
                    onConfirm={handleConfirmLeaveCommunity}
                    onClose={() => setLeavingCommunity(null)}
                    primaryButtonLabel={t('words.okay')}
                />
            )}
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
