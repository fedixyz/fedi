import { Text, Theme, useTheme, Image } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { Images } from '@fedi/native/assets/images'

import { BubbleView } from '../../ui/BubbleView'
import { Row, Column } from '../../ui/Flex'
import SvgImage, { type SvgImageName } from '../../ui/SvgImage'

/** `.scroll` in the design pads the page by 20 on each side. */
const SCREEN_PADDING = 20

/**
 * The scrollable content of the wallet service entry: an illustration and two
 * rows describing guardians, per story 01.
 *
 * Deliberately separate from `GuardianitoIntro` even though the two currently
 * share an illustration. The design calls for a graphic whose centre node reads
 * "Wallet Service" rather than "Federation"; until that asset lands, this reuses
 * the federation graphic.
 */
export const WalletServiceIntro: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const infoItems: Array<{ icon: SvgImageName; text: string }> = [
        {
            icon: 'SocialPeople',
            text: t('feature.onboarding.create-info-1'),
        },
        {
            icon: 'ShieldHalfFilled',
            text: t('feature.onboarding.create-info-3'),
        },
    ]

    const style = styles(theme)

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={style.scrollContainer}
            overScrollMode="auto">
            <View style={style.createContainer}>
                {/* the size has to sit on the container: RNE absolutely
                    fills it with the image, so `style` only shapes the
                    box, never where it lands */}
                <Image
                    source={Images.FederationCreate}
                    containerStyle={style.hubIllustration}
                    style={style.hubIllustrationImage}
                    resizeMode="contain"
                />
                <Column gap="sm" fullWidth>
                    {infoItems.map(item => (
                        <Row align="center" gap="md" key={item.icon}>
                            <BubbleView containerStyle={style.infoIcon}>
                                <SvgImage
                                    name={item.icon}
                                    size="sm"
                                    color={theme.colors.white}
                                />
                            </BubbleView>
                            <Text
                                small
                                color={theme.colors.darkGrey}
                                style={style.infoText}>
                                {item.text}
                            </Text>
                        </Row>
                    ))}
                </Column>
            </View>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        createContainer: {
            width: '100%',
        },
        hubIllustration: {
            alignSelf: 'center',
            // the ratio has to sit here, not on the image: RNE absolutely
            // fills the container, so the inner style can never give the box a
            // height and the illustration collapses to nothing
            // the asset is 936x840; 931/816 gave the box the wrong shape
            aspectRatio: 936 / 840,
            marginBottom: 16,
            marginTop: 16,
            maxWidth: 'auto',
            width: '100%',
        },
        hubIllustrationImage: {
            height: '100%',
            width: '100%',
        },
        infoIcon: {
            alignItems: 'center',
            backgroundColor: theme.colors.night,
            borderRadius: theme.borders.tileRadius,
            height: 40,
            justifyContent: 'center',
            width: 40,
        },
        infoText: {
            flex: 1,
            lineHeight: 16,
        },
        scrollContainer: {
            alignItems: 'center',
            flexGrow: 1,
            paddingBottom: 16,
            paddingHorizontal: SCREEN_PADDING,
            // the illustration sits directly under the tab switcher
            paddingTop: 0,
        },
    })
