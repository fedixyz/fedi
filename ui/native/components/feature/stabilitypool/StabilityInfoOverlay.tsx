import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet } from 'react-native'

import { STABLE_BALANCE_SUPPORT_ARTICLE_URL } from '@fedi/common/constants/linking'

import CenterOverlay from '../../ui/CenterOverlay'
import { Column } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type StabilityInfoOverlayProps = {
    onDismiss: () => void
    show?: boolean
}

const StabilityInfoOverlay: React.FC<StabilityInfoOverlayProps> = ({
    show = false,
    onDismiss,
}) => {
    const { theme } = useTheme()

    const style = styles(theme)
    const { t } = useTranslation()
    const handleLearnMore = () => {
        Linking.openURL(STABLE_BALANCE_SUPPORT_ARTICLE_URL)
    }
    return (
        <CenterOverlay
            show={show}
            onBackdropPress={onDismiss}
            showCloseButton
            overlayStyle={style.container}>
            <SvgImage
                name="UsdCircleFilled"
                size={SvgImageSize.xl}
                color={theme.colors.mint}
            />
            <Column gap={theme.spacing.md}>
                <Text h2 bolder center>
                    {t('feature.stabilitypool.what-is-stable-balance')}
                </Text>
                <Text>{t('feature.stabilitypool.info-description')}</Text>
            </Column>
            <Button
                fullWidth
                day
                outline
                containerStyle={style.learnMoreButton}
                title={t('phrases.learn-more')}
                onPress={handleLearnMore}
            />
        </CenterOverlay>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            gap: theme.spacing.lg,
            padding: theme.spacing.xl,
        },
        title: {
            textAlign: 'center',
        },
        learnMoreButton: {
            borderWidth: 1,
            borderRadius: 40,
            borderColor: theme.colors.lightGrey,
        },
    })
export default StabilityInfoOverlay
