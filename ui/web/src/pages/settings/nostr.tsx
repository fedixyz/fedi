import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import EyeClosedIcon from '@fedi/common/assets/svgs/eye-closed.svg'
import EyeIcon from '@fedi/common/assets/svgs/eye.svg'
import { selectNostrNpub, selectNostrNsec } from '@fedi/common/redux'

import { ContentBlock } from '../../components/ContentBlock'
import { CopyButton } from '../../components/CopyButton'
import { Icon } from '../../components/Icon'
import * as Layout from '../../components/Layout'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

function SettingsNostrPage() {
    const { t } = useTranslation()

    const [showSecret, setShowSecret] = useState<boolean>(false)

    const nostrPublic = useAppSelector(selectNostrNpub)
    const nostrSecret = useAppSelector(selectNostrNsec)

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/settings">
                    <Layout.Title subheader>
                        {t('feature.nostr.nostr-settings')}
                    </Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <Content>
                        {nostrPublic?.npub && (
                            <Row>
                                <IconWrapper>
                                    <CopyButton text={nostrPublic.npub} />
                                </IconWrapper>
                                <LabelWrapper>
                                    <Label>
                                        {t('feature.nostr.nostr-public-key')}
                                    </Label>
                                </LabelWrapper>

                                <Value>{nostrPublic.npub}</Value>
                            </Row>
                        )}
                        {nostrSecret?.nsec && (
                            <Row>
                                <IconWrapper>
                                    <CopyButton text={nostrSecret.nsec} />
                                </IconWrapper>
                                <LabelWrapper>
                                    <Label>
                                        {t('feature.nostr.nostr-secret-key')}{' '}
                                    </Label>
                                    <InlineIconWrapper
                                        onClick={() =>
                                            setShowSecret(!showSecret)
                                        }>
                                        <Icon
                                            icon={
                                                showSecret
                                                    ? EyeIcon
                                                    : EyeClosedIcon
                                            }
                                        />
                                    </InlineIconWrapper>
                                </LabelWrapper>

                                <Value>
                                    {showSecret
                                        ? nostrSecret.nsec
                                        : nostrSecret.nsec.replace(
                                              /[A-z0-9]/g,
                                              '•',
                                          )}
                                </Value>
                            </Row>
                        )}
                    </Content>
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled('div', {})

const Row = styled('div', {
    marginBottom: '10px',
    overflow: 'hidden',
    position: 'relative',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
})

const InlineIconWrapper = styled('div', {
    alignItems: 'center',
    color: theme.colors.darkGrey,
    display: 'flex',
    marginLeft: '10px',
})

const IconWrapper = styled('div', {
    color: theme.colors.darkGrey,
    position: 'absolute',
    right: 0,
})

const LabelWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
})

const Label = styled('label', {
    color: theme.colors.black,
    fontSize: '16px',
    fontWeight: 'bold',
})

const Value = styled('p', {
    color: theme.colors.darkGrey,
    fontSize: '14px',
    maskImage: 'linear-gradient(to right, black 85%, transparent 100%)',
})

export default SettingsNostrPage
