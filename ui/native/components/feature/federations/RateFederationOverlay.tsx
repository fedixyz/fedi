import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import {
    Image,
    ImageBackground,
    Pressable,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native'

import { useFederationRating } from '@fedi/common/hooks/federation'
import { scaleAttachment } from '@fedi/common/utils/media'

import { Images } from '../../../assets/images'
import { fedimint } from '../../../bridge'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import { FederationLogo } from './FederationLogo'

interface Props {
    show: boolean
    onDismiss: () => void
}

export const RateFederationOverlay: React.FC<Props> = ({ onDismiss, show }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { width } = useWindowDimensions()
    const { rating, setRating, federationToRate, handleSubmitRating } =
        useFederationRating(fedimint)

    const style = styles(theme)

    const dimensions = Image.resolveAssetSource(Images.RateFederationBackground)
    const bgImageHeight = scaleAttachment(
        dimensions.width,
        dimensions.height,
        width,
        dimensions.height,
    ).height

    const handleSubmit = () => {
        handleSubmitRating(() => onDismiss())
    }

    return (
        <CustomOverlay
            show={show}
            noHeaderPadding
            onBackdropPress={onDismiss}
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
                                    federation={federationToRate}
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
                                        federation: federationToRate?.name,
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
