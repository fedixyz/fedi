import { styled } from '@stitches/react'
import { Trans, useTranslation } from 'react-i18next'

import { theme } from '@fedi/common/constants/theme'
import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { JoinPreview, LoadedFederationListItem } from '@fedi/common/types'

import { FederationAvatar } from './FederationAvatar'
import { Text } from './Text'

export default function FederationEndedPreview({
    popupInfo,
    federation,
}: {
    popupInfo: ReturnType<typeof usePopupFederationInfo>
    federation: LoadedFederationListItem | JoinPreview
}) {
    const { t } = useTranslation()

    return (
        <Container>
            <FederationAvatar federation={federation} size="lg" />
            <Text variant="h2">{federation.name}</Text>
            <Ended>{t('feature.popup.ended')}</Ended>
            <Text css={{ marginBottom: 24 }}>
                {popupInfo?.endedMessage || (
                    <Trans
                        t={t}
                        i18nKey="feature.popup.ended-description"
                        values={{ date: popupInfo?.endsAtText }}
                        components={{ bold: <strong /> }}
                    />
                )}
            </Text>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 16,
})

const Ended = styled('div', {
    padding: `2px 8px`,
    borderRadius: '30px',
    background: theme.colors.lightGrey,
    color: theme.colors.primary,
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.bold,
})
