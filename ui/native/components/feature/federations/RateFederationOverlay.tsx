import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Image,
    ImageBackground,
    Pressable,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native'

import {
    setSeenFederationRating,
    rateFederation,
    selectActiveFederation,
} from '@fedi/common/redux'
import { scaleAttachment } from '@fedi/common/utils/media'

import { Images } from '../../../assets/images'
import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import { FederationLogo } from './FederationLogo'

interface Props {
    show: boolean
    onDismiss: () => void
}

export const RateFederationOverlay: React.FC<Props> = ({ onDismiss, show }) => {
    const [rating, setRating] = useState<number | null>(null)
    const activeFederation = useAppSelector(selectActiveFederation)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { width } = useWindowDimensions()
    const dispatch = useAppDispatch()

    const style = styles(theme)

    const dimensions = Image.resolveAssetSource(Images.RateFederationBackground)
    const bgImageHeight = scaleAttachment(
        dimensions.width,
        dimensions.height,
        width,
        dimensions.height,
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

    return (
        <CustomOverlay
            show={show}
            noHeaderPadding
            onBackdropPress={handleDismiss}
            contents={{
                body: (
                    <Flex>
                        <ImageBackground
                            source={Images.RateFederationBackground}
                            style={[
                                style.banner,
                                { minHeight: bgImageHeight },
                            ]}>
                            <View style={style.logoContainer}>
                                <FederationLogo
                                    federation={activeFederation}
                                    size={88}
                                />
                            </View>
                            <Pressable
                                style={style.closeButton}
                                onPress={onDismiss}
                                hitSlop={10}>
                                <SvgImage name="Close" size={20} />
                            </Pressable>
                        </ImageBackground>
                        <Flex style={style.content} gap="xl">
                            <Text h2 bold center>
                                {t(
                                    'feature.federation.how-was-your-experience-with',
                                    {
                                        federation: activeFederation?.name,
                                    },
                                )}
                            </Text>
                            <Flex row>
                                {new Array(5).fill(0).map((_, i) => (
                                    <Pressable
                                        key={`star-${i}`}
                                        onPress={() => setRating(i)}
                                        style={style.starCell}>
                                        <SvgImage
                                            name={
                                                (rating ?? -1) < i
                                                    ? 'StarOutline'
                                                    : 'Star'
                                            }
                                            color={
                                                (rating ?? -1) < i
                                                    ? theme.colors.primary
                                                    : theme.colors.orange
                                            }
                                            size={24}
                                        />
                                        {i === 0 && (
                                            <Text
                                                medium
                                                caption
                                                color={theme.colors.grey}>
                                                {t(
                                                    'phrases.federation-rating-very-bad',
                                                )}
                                            </Text>
                                        )}
                                        {i === 4 && (
                                            <Text
                                                medium
                                                caption
                                                color={theme.colors.grey}>
                                                {t(
                                                    'phrases.federation-rating-very-good',
                                                )}
                                            </Text>
                                        )}
                                    </Pressable>
                                ))}
                            </Flex>
                            <Button
                                title={t('words.submit')}
                                disabled={rating === null}
                                onPress={handleSubmit}
                            />
                        </Flex>
                    </Flex>
                ),
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        content: {
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.lg,
        },
        banner: {
            position: 'relative',
            width: '100%',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            borderTopRightRadius: 20,
            borderTopLeftRadius: 20,
        },
        logoContainer: {
            position: 'absolute',
        },
        closeButton: {
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
        },
        starCell: {
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
    })

export default RateFederationOverlay
