import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import ArrowRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import SettingsIcon from '@fedi/common/assets/svgs/cog.svg'
import userProfile from '@fedi/common/assets/svgs/profile.svg'
import WordListIcon from '@fedi/common/assets/svgs/word-list.svg'
import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { useNuxStep } from '@fedi/common/hooks/nux'
import {
    selectActiveFederation,
    selectActiveFederationChats,
    selectIsActiveFederationRecovering,
    selectMatrixAuth,
    selectActiveFederationHasWallet,
    selectOnboardingMethod,
} from '@fedi/common/redux'
import {
    selectCoreMods,
    selectVisibleCommunityMods,
} from '@fedi/common/redux/mod'
import stringUtils from '@fedi/common/utils/StringUtils'

import { Avatar } from '../components/Avatar'
import { BitcoinWallet } from '../components/BitcoinWallet'
import { ContentBlock } from '../components/ContentBlock'
import { FederationAvatar } from '../components/FederationAvatar'
import { FediModTiles } from '../components/FediModTiles'
import { Icon } from '../components/Icon'
import { InstallBanner } from '../components/InstallBanner'
import * as Layout from '../components/Layout'
import { Modal } from '../components/Modal'
import { RecoveryInProgress } from '../components/RecoveryInProgress'
import { Text } from '../components/Text'
import {
    useAppSelector,
    useDeviceQuery,
    useInstallPromptContext,
    useShowInstallPromptBanner,
} from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'

const BACKUP_REMINDER_MIN_BALANCE = 1000000 // 1000000 msats or 1000 sats

function HomePage() {
    const { t } = useTranslation()
    const deferredPrompt = useInstallPromptContext()
    const { isIOS } = useDeviceQuery()
    const { showInstallBanner, handleOnDismiss } = useShowInstallPromptBanner()
    const router = useRouter()

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache(fedimint)

    const [hasSeenDisplayName, completeSeenDisplayName] =
        useNuxStep('displayNameModal')
    const [hasPerformedPersonalBackup] = useNuxStep(
        'hasPerformedPersonalBackup',
    )

    const handleOnInstall = async () => {
        await deferredPrompt?.prompt()
    }

    const recoveryInProgress = useAppSelector(
        selectIsActiveFederationRecovering,
    )
    const mods = useAppSelector(selectVisibleCommunityMods)
    const coreMods = useAppSelector(selectCoreMods)
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const activeFederation = useAppSelector(selectActiveFederation)
    const newsItems = useAppSelector(s => selectActiveFederationChats(s))
    const onboardingMethod = useAppSelector(selectOnboardingMethod)
    const isNewSeedUser = onboardingMethod !== 'restored'

    // Federations have wallets, communities do not
    const hasWallet = useAppSelector(selectActiveFederationHasWallet)

    // Get first chat message to use as Federation News for now
    // Improvement: Show carousel of announcements to show multiple news items
    const newsItem = newsItems.length > 0 ? newsItems[0] : null

    const showFederation = !activeFederation || hasWallet

    // Get rates from cache
    useEffect(() => {
        syncCurrencyRatesAndCache()
    }, [syncCurrencyRatesAndCache])

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Content>
                    <Content>
                        {showFederation && (
                            <Section>
                                {recoveryInProgress ? (
                                    <RecoveryInProgress
                                        label={t(
                                            'feature.recovery.recovery-in-progress-balance',
                                        )}
                                    />
                                ) : (
                                    <BitcoinWallet />
                                )}
                            </Section>
                        )}

                        {!activeFederation && (
                            <Section>
                                <Title variant="h2">
                                    {t(
                                        showFederation
                                            ? 'feature.home.federation-news-title'
                                            : 'feature.home.community-news-title',
                                    )}
                                </Title>

                                <NewsContainer>
                                    <NewsItem href="/onboarding">
                                        <NewsItemIcon>
                                            <Icon icon={ChatIcon} />
                                        </NewsItemIcon>
                                        <NewsItemText>
                                            {t(
                                                'feature.home.federation-updates',
                                            )}
                                        </NewsItemText>
                                        <NewsItemArrow>
                                            <Icon icon={ArrowRightIcon} />
                                        </NewsItemArrow>
                                    </NewsItem>
                                </NewsContainer>
                            </Section>
                        )}

                        {activeFederation && newsItem && (
                            <Section>
                                <Title variant="h2">
                                    {t(
                                        showFederation
                                            ? 'feature.home.federation-news-title'
                                            : 'feature.home.community-news-title',
                                    )}
                                </Title>

                                <NewsContainer>
                                    <NewsItem
                                        href={`/chat/room/${newsItem.id}`}>
                                        <NewsItemIcon>
                                            <FederationAvatar
                                                federation={activeFederation}
                                                size="sm"
                                            />
                                        </NewsItemIcon>
                                        <NewsItemText>
                                            <Text variant="body" weight="bold">
                                                {stringUtils.truncateString(
                                                    newsItem.name,
                                                    25,
                                                )}
                                            </Text>
                                            {newsItem.preview && (
                                                <Text variant="small">
                                                    {stringUtils.truncateString(
                                                        stringUtils.stripNewLines(
                                                            newsItem.preview
                                                                .body,
                                                        ),
                                                        25,
                                                    )}
                                                </Text>
                                            )}
                                        </NewsItemText>
                                        <NewsItemArrow>
                                            <Icon icon={ArrowRightIcon} />
                                        </NewsItemArrow>
                                    </NewsItem>
                                </NewsContainer>
                            </Section>
                        )}

                        <Section>
                            <Title variant="h2">
                                {t(
                                    showFederation
                                        ? 'feature.home.federation-mods-title'
                                        : 'feature.home.community-mods-title',
                                )}
                            </Title>
                            <SubTitle variant="body">
                                {t(
                                    showFederation
                                        ? 'feature.home.federation-services-selected'
                                        : 'feature.home.community-services-selected',
                                )}
                            </SubTitle>
                            <ErrorBoundary fallback={null}>
                                <FediModTiles
                                    mods={activeFederation ? mods : coreMods}
                                />
                            </ErrorBoundary>
                        </Section>
                    </Content>
                </Layout.Content>

                {showInstallBanner && (
                    <InstallBanner
                        title={t('feature.home.pwa-install-banner-title')}
                        description={t(
                            'feature.home.pwa-install-banner-description',
                        )}
                        buttonLabel={t(
                            'feature.home.pwa-install-banner-button-label',
                        )}
                        onInstall={
                            isIOS
                                ? () =>
                                      window.open(
                                          'https://support.fedi.xyz/hc/en-us/articles/27283843087634',
                                          '_blank',
                                      )
                                : handleOnInstall
                        }
                        onClose={handleOnDismiss}
                    />
                )}
            </Layout.Root>

            {/* Modal - Show user their display name */}
            <Modal
                open={
                    isNewSeedUser &&
                    !hasSeenDisplayName &&
                    !!matrixAuth?.displayName
                }
                onClick={completeSeenDisplayName}
                title={t('feature.home.display-name')}
                description={matrixAuth?.displayName}>
                <ModalContent aria-label="test">
                    <ModalIconWrapper>
                        <Icon icon={userProfile} size="xl" />
                    </ModalIconWrapper>
                    <ModalTextWrapper>
                        <Text variant="h2">
                            {t('feature.home.display-name')}
                        </Text>
                        <Text variant="h2">
                            &quot;{matrixAuth?.displayName}&quot;
                        </Text>
                    </ModalTextWrapper>
                    <ModalTextWithIcon
                        variant="body"
                        css={{ color: theme.colors.darkGrey }}>
                        <Trans
                            i18nKey="feature.home.profile-change-icon"
                            components={{
                                icon: <ModalIcon icon={SettingsIcon} />,
                            }}
                        />
                    </ModalTextWithIcon>
                </ModalContent>
            </Modal>

            {/* Modal - Ask user to backup if their balance is above 1000 sats */}
            <Modal
                open={
                    !!activeFederation &&
                    activeFederation.balance > BACKUP_REMINDER_MIN_BALANCE &&
                    !hasPerformedPersonalBackup
                }
                onClick={() => router.push('/settings/backup/personal')}
                title={t('feature.home.backup-wallet-title')}
                description={t('feature.home.backup-wallet-description')}>
                <ModalContent aria-label="test">
                    <ModalIconWrapper>
                        <Avatar
                            size="md"
                            id=""
                            name="list"
                            holo
                            icon={WordListIcon}
                            css={{ alignSelf: 'center' }}
                        />
                    </ModalIconWrapper>
                    <ModalTextWrapper>
                        <Text variant="h2">
                            {t('feature.home.backup-wallet-title')}
                        </Text>
                    </ModalTextWrapper>
                    <Text variant="body" css={{ color: theme.colors.darkGrey }}>
                        {t('feature.home.backup-wallet-description')}
                    </Text>
                </ModalContent>
            </Modal>
        </ContentBlock>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
})

const Section = styled('div', {
    marginBottom: 20,
})

const Title = styled(Text, {})

const SubTitle = styled(Text, {
    color: theme.colors.darkGrey,
})

const NewsContainer = styled('div', {})

const NewsItem = styled(Link, {
    alignItems: 'center',
    background: theme.colors.offWhite100,
    borderRadius: 20,
    boxSizing: 'border-box',
    color: theme.colors.night,
    display: 'flex',
    gap: 10,
    overflow: 'hidden',
    padding: 15,
})

const NewsItemIcon = styled('div', {
    alignItems: 'center',
    display: 'flex',
    minWidth: 30,
})

const NewsItemText = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    textAlign: 'left',
})

const NewsItemArrow = styled('div', {
    alignItems: 'center',
    display: 'flex',
    width: 20,
})

const ModalContent = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
})

const ModalTextWrapper = styled('div', {
    marginBottom: 10,
})

const ModalTextWithIcon = styled(Text, {
    alignItems: 'center',
    display: 'flex',
})

const ModalIcon = styled(Icon, {
    margin: '0 3px',
    width: 20,
})

const ModalIconWrapper = styled('div', {
    alignItems: 'center',
    borderRadius: '50%',
    boxSizing: 'border-box',
    display: 'flex',
    height: 50,
    holoGradient: '600',
    justifyContent: 'center',
    marginBottom: 10,
    padding: 5,
    overflow: 'hidden',
    width: 50,
})

export default HomePage
