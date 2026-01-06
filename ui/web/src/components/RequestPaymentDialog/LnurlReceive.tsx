import { styled } from '@stitches/react'
import { useTranslation } from 'react-i18next'

import { useLnurlReceiveCode } from '@fedi/common/hooks/receive'
import { TransactionListEntry } from '@fedi/common/types'

import { QRContainer } from '.'
import { theme } from '../../styles'
import { CopyInput } from '../CopyInput'
import { HoloLoader } from '../HoloLoader'
import { QRCode } from '../QRCode'
import { Text } from '../Text'

export default function LnurlReceive({
    federationId,
}: {
    federationId: string
    onSubmit: () => void
    onWithdrawPaid: (txn: TransactionListEntry) => void
}) {
    const { lnurlReceiveCode, isLoading } = useLnurlReceiveCode(
        federationId || '',
    )

    const { t } = useTranslation()

    return (
        <Container>
            <LnurlNotice>
                <LnurlNoticeTitle variant="body" weight="medium">
                    ℹ️ {t('feature.receive.lnurl-receive-notice-1')}
                </LnurlNoticeTitle>
                <LnurlNoticeText variant="caption">
                    {t('feature.receive.lnurl-receive-notice-2')}
                </LnurlNoticeText>
            </LnurlNotice>
            <QRContainer>
                {isLoading || !lnurlReceiveCode ? (
                    <HoloLoader />
                ) : (
                    <>
                        <QRCode data={lnurlReceiveCode} />
                        <CopyInput
                            value={lnurlReceiveCode || ''}
                            onCopyMessage={t(
                                'feature.receive.copied-payment-code',
                            )}
                        />
                    </>
                )}
            </QRContainer>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
})

const LnurlNotice = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    marginTop: 'auto',
    marginBottom: 'auto',
    backgroundColor: theme.colors.offWhite100,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    borderRadius: 8,
})

const LnurlNoticeTitle = styled(Text, {
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
})

const LnurlNoticeText = styled(Text, {
    color: theme.colors.darkGrey,
    textAlign: 'center',
})
