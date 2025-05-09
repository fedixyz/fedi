import Link from 'next/link'
import { useTranslation } from 'react-i18next'

import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import ArrowRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import userProfile from '@fedi/common/assets/svgs/profile.svg'
import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectFederations, selectMatrixAuth } from '@fedi/common/redux'

import { BitcoinWallet } from '../components/BitcoinWallet'
import { ContentBlock } from '../components/ContentBlock'
import { FediModTiles } from '../components/FediModTiles'
import { Icon } from '../components/Icon'
import * as Layout from '../components/Layout'
import { Modal } from '../components/Modal'
import { Text } from '../components/Text'
import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'

function HomePage() {
    const { t } = useTranslation()

    const [hasSeenDisplayName, completeSeenDisplayName] =
        useNuxStep('displayNameModal')
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const federations = useAppSelector(selectFederations)

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header>
                    <Layout.Title>{t('words.home')}</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <Content>
                        <Section>
                            <BitcoinWallet />
                        </Section>
                        {/* Hide community news section for now until designs and endpoints are are ready */}
                        {federations.length === 0 && (
                            <Section>
                                <Title variant="h2">
                                    {t('feature.home.federation-news-title')}
                                </Title>
                                <SubTitle variant="body">
                                    <JoinBlock href="/onboarding">
                                        <EmptyBlockIcon>
                                            <Icon icon={ChatIcon} />
                                        </EmptyBlockIcon>
                                        <EmptyBlockText>
                                            {t(
                                                'feature.home.federation-updates',
                                            )}
                                        </EmptyBlockText>
                                        <EmptyBlockArrow>
                                            <Icon icon={ArrowRightIcon} />
                                        </EmptyBlockArrow>
                                    </JoinBlock>
                                </SubTitle>
                            </Section>
                        )}

                        <Section>
                            <Title variant="h2">
                                {t('feature.home.federation-mods-title')}
                            </Title>
                            <SubTitle variant="body">
                                {t('feature.home.federation-services-selected')}
                            </SubTitle>
                            <ErrorBoundary fallback={null}>
                                <FediModTiles
                                    isFederation={federations.length > 0}
                                />
                            </ErrorBoundary>
                        </Section>
                    </Content>
                </Layout.Content>
            </Layout.Root>

            <Modal
                open={!hasSeenDisplayName && !!matrixAuth?.displayName}
                onClick={completeSeenDisplayName}>
                <ModalContent>
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

const JoinBlock = styled(Link, {
    alignItems: 'center',
    background: theme.colors.offWhite,
    borderRadius: 20,
    boxSizing: 'border-box',
    color: theme.colors.night,
    display: 'flex',
    gap: 10,
    padding: 20,
})

const EmptyBlockIcon = styled('div', {
    alignItems: 'center',
    display: 'flex',
    width: 30,
})

const EmptyBlockText = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    textAlign: 'left',
})

const EmptyBlockArrow = styled('div', {
    alignItems: 'center',
    display: 'flex',
    width: 20,
})

const ModalContent = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    justifyContent: 'center',
})

const ModalTextWrapper = styled('div', {})

const ModalIconWrapper = styled('div', {
    alignItems: 'center',
    borderRadius: '50%',
    boxSizing: 'border-box',
    display: 'flex',
    height: 50,
    holoGradient: '600',
    justifyContent: 'center',
    padding: 5,
    overflow: 'hidden',
    width: 50,
})

export default HomePage
