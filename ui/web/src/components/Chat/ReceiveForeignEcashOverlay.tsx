import { styled } from '@stitches/react'
import { Trans, useTranslation } from 'react-i18next'

import ArrowRight from '@fedi/common/assets/svgs/arrow-right.svg'
import BrokenHeart from '@fedi/common/assets/svgs/broken-heart.svg'
import ChevronLeft from '@fedi/common/assets/svgs/chevron-left.svg'
import ChevronRight from '@fedi/common/assets/svgs/chevron-right.svg'
import { theme } from '@fedi/common/constants/theme'
import { useAcceptForeignEcash } from '@fedi/common/hooks/chat'
import { MatrixPaymentEvent } from '@fedi/common/types'
import { RpcFederationPreview } from '@fedi/common/types/bindings'

import { Dialog } from '../Dialog'
import { FederationAvatar } from '../FederationAvatar'
import { Column, Row } from '../Flex'
import { Icon } from '../Icon'
import FederationPreview from '../Onboarding/FederationPreview'
import { Text } from '../Text'

export const ReceiveForeignEcashOverlay = ({
    open,
    onOpenChange,
    paymentEvent,
    onRejected,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    paymentEvent: MatrixPaymentEvent
    onRejected: () => void
}) => {
    const { t } = useTranslation()
    const {
        isJoining,
        isFetchingPreview,
        federationPreview,
        handleJoin,
        showFederationPreview,
        setShowFederationPreview,
        hideOtherMethods,
        setHideOtherMethods,
    } = useAcceptForeignEcash(t, paymentEvent)

    const renderOverlayContents = () => {
        if (isFetchingPreview) return null
        if (federationPreview && showFederationPreview) {
            return (
                <FederationPreviewContainer>
                    <FederationPreview
                        onJoin={recoverFromScratch =>
                            handleJoin(
                                () => onOpenChange(false),
                                recoverFromScratch,
                            )
                        }
                        onBack={() => setShowFederationPreview(false)}
                        federation={federationPreview}
                        isJoining={isJoining}
                    />
                </FederationPreviewContainer>
            )
        }

        return (
            <Column gap="md">
                {federationPreview ? (
                    <FederationPreviewCard
                        federationPreview={federationPreview}
                        onJoin={() => setShowFederationPreview(true)}
                    />
                ) : (
                    <Text center>{t('errors.unknown-ecash-issuer')}</Text>
                )}
                {!hideOtherMethods && (
                    <RejectPaymentCard
                        onReject={() => {
                            onRejected()
                            onOpenChange(false)
                        }}
                    />
                )}
                <OtherMethodsButton
                    onClick={() => setHideOtherMethods(!hideOtherMethods)}>
                    <Row center gap="sm">
                        <Text css={{ whiteSpace: 'nowrap' }}>
                            {hideOtherMethods
                                ? t('feature.receive.other-methods')
                                : t('feature.receive.hide-other-methods')}
                        </Text>
                        <ChevronIcon
                            icon={hideOtherMethods ? ChevronRight : ChevronLeft}
                            size="sm"
                        />
                    </Row>
                </OtherMethodsButton>
            </Column>
        )
    }

    return (
        <Dialog
            type="tray"
            open={open}
            onOpenChange={onOpenChange}
            title={t('words.receive')}>
            {renderOverlayContents()}
        </Dialog>
    )
}

function RejectPaymentCard({ onReject }: { onReject: () => void }) {
    const { t } = useTranslation()

    return (
        <ActionCard onClick={onReject}>
            <RejectIconContainer center>
                <Icon icon={BrokenHeart} size="md" color={theme.colors.white} />
            </RejectIconContainer>
            <Column align="start" gap="xs" justify="between" grow>
                <Text weight="medium">
                    {t('feature.receive.reject-payment')}
                </Text>
            </Column>
            <Icon icon={ArrowRight} size="sm" />
        </ActionCard>
    )
}

function FederationPreviewCard({
    federationPreview,
    onJoin,
}: {
    federationPreview: RpcFederationPreview
    onJoin: () => void
}) {
    const { t } = useTranslation()

    return (
        <ActionCard onClick={onJoin}>
            <IconContainer center>
                <FederationAvatar federation={federationPreview} size="md" />
            </IconContainer>
            <Column align="start" gap="xxs" grow>
                <Text weight="medium">
                    {t('feature.receive.join-new-federation')}
                </Text>
                <TextDarkGrey variant="caption">
                    <Trans
                        t={t}
                        i18nKey="feature.receive.join-to-receive"
                        values={{
                            federation: federationPreview.name,
                        }}
                        components={{
                            bold: (
                                // @ts-expect-error - children will be passed later
                                <TextDarkGrey variant="caption" weight="bold" />
                            ),
                        }}
                    />
                </TextDarkGrey>
            </Column>
            <Icon icon={ArrowRight} size="sm" />
        </ActionCard>
    )
}

const RejectIconContainer = styled(Column, {
    backgroundColor: theme.colors.red,
    width: 48,
    height: 48,
    borderRadius: '50%',
})

const OtherMethodsButton = styled('button', {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: theme.spacing.sm,
})

const TextDarkGrey = styled(Text, {
    color: theme.colors.darkGrey,
    display: 'inline',
})

const ActionCard = styled('button', {
    border: 'none',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.offWhite,
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    width: '100%',
    textAlign: 'left',
})

const IconContainer = styled(Column, {
    width: 48,
    height: 48,
})

const ChevronIcon = styled(Icon, {
    transform: 'rotate(-90deg)',
    width: 24,
    height: 24,
})

const FederationPreviewContainer = styled('div', {
    paddingTop: theme.spacing.lg,
})
