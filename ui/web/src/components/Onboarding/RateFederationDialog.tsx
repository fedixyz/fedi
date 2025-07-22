import { styled } from '@stitches/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import RateFederationBg from '@fedi/common/assets/images/rate-federation-bg.png'
import CloseIcon from '@fedi/common/assets/svgs/close.svg'
import StarOutlineIcon from '@fedi/common/assets/svgs/star-outline.svg'
import StarIcon from '@fedi/common/assets/svgs/star.svg'
import { theme } from '@fedi/common/constants/theme'
import {
    rateFederation,
    selectActiveFederation,
    setSeenFederationRating,
} from '@fedi/common/redux'
import { scaleAttachment } from '@fedi/common/utils/media'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { FederationAvatar } from '../FederationAvatar'
import { Icon } from '../Icon'
import { Text } from '../Text'

interface Props {
    show: boolean
    onDismiss: () => void
}

const RateFederationDialog: React.FC<Props> = ({ show, onDismiss }) => {
    const [rating, setRating] = useState<number | null>(null)
    const [windowWidth, setWindowWidth] = useState<number>(0)
    const activeFederation = useAppSelector(selectActiveFederation)
    const { t } = useTranslation()
    const dispatch = useAppDispatch()

    const bgImageHeight = scaleAttachment(
        RateFederationBg.width,
        RateFederationBg.height,
        windowWidth,
        RateFederationBg.height,
    ).height

    const handleDismiss = () => {
        if (!activeFederation) return

        dispatch(
            setSeenFederationRating({
                federationId: activeFederation.id,
            }),
        )
        onDismiss()
    }

    const handleSubmit = () => {
        if (!rating) return
        dispatch(rateFederation({ fedimint, rating: rating + 1 }))
            .unwrap()
            .then(onDismiss)
    }

    useEffect(() => setWindowWidth(Math.min(window.innerWidth, 500)), [])

    return (
        <Dialog
            open={show}
            onOpenChange={handleDismiss}
            mobileDismiss="overlay"
            disableOverlayHandle
            disableClose
            disablePadding>
            <Container data-testid="rate-federation-overlay">
                <Banner
                    style={{
                        minHeight: bgImageHeight,
                        backgroundImage: `url(${RateFederationBg.src})`,
                    }}>
                    <FederationIconContainer>
                        {activeFederation && (
                            <FederationAvatar
                                federation={activeFederation}
                                size="lg"
                            />
                        )}
                    </FederationIconContainer>
                    <CloseButton onClick={handleDismiss}>
                        <Icon icon={CloseIcon} />
                    </CloseButton>
                </Banner>
                <Content>
                    <Text variant="h2" weight="medium" center>
                        {t('feature.federation.how-was-your-experience-with', {
                            federation: activeFederation?.name,
                        })}
                    </Text>
                    <Stars>
                        {new Array(5).fill(0).map((_, i) => (
                            <Star
                                key={`star-${i}`}
                                onClick={() => setRating(i)}>
                                <Icon
                                    icon={
                                        (rating ?? -1) < i
                                            ? StarOutlineIcon
                                            : StarIcon
                                    }
                                    style={{
                                        color:
                                            (rating ?? -1) < i
                                                ? theme.colors.black
                                                : theme.colors.orange,
                                    }}
                                    size={24}
                                />
                                {i === 0 && (
                                    <Text
                                        weight="medium"
                                        variant="caption"
                                        css={{ color: theme.colors.grey }}>
                                        {t(
                                            'phrases.federation-rating-very-bad',
                                        )}
                                    </Text>
                                )}
                                {i === 4 && (
                                    <Text
                                        weight="medium"
                                        variant="caption"
                                        css={{ color: theme.colors.grey }}>
                                        {t(
                                            'phrases.federation-rating-very-good',
                                        )}
                                    </Text>
                                )}
                            </Star>
                        ))}
                    </Stars>
                    <Button onClick={handleSubmit}>{t('words.submit')}</Button>
                </Content>
            </Container>
        </Dialog>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
})

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 16px',
    gap: 24,
})

const Stars = styled('div', {
    display: 'flex',
})

const Star = styled('button', {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'column',
    gap: 8,
})

const FederationIconContainer = styled('div', {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
})

const Banner = styled('div', {
    position: 'relative',
    top: 0,
    left: 0,
    width: '100%',
    backgroundSize: 'cover',
})

const CloseButton = styled('button', {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 24,
    height: 24,
    backgroundColor: theme.colors.white,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
})

export default RateFederationDialog
