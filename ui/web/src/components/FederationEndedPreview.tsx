import { styled } from '@stitches/react'
import { Dispatch, SetStateAction, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { theme } from '@fedi/common/constants/theme'
import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { LoadedFederation } from '@fedi/common/types'
import { RpcFederationPreview } from '@fedi/common/types/bindings'

import { isNightly } from '../utils/browserInfo'
import { FederationAvatar } from './FederationAvatar'
import { Text } from './Text'

export default function FederationEndedPreview({
    popupInfo,
    federation,
    setJoinAnyways,
}: {
    popupInfo: ReturnType<typeof usePopupFederationInfo>
    federation: LoadedFederation | RpcFederationPreview
    setJoinAnyways: Dispatch<SetStateAction<boolean>>
}) {
    const [, setClicks] = useState(0)
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
                        components={{
                            bold: (
                                <strong
                                    onClick={() => {
                                        if (
                                            !isNightly() &&
                                            process.env.NODE_ENV !==
                                                'development'
                                        )
                                            return

                                        setClicks(c => {
                                            if (c >= 21) setJoinAnyways(true)

                                            return c + 1
                                        })
                                    }}
                                />
                            ),
                        }}
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
