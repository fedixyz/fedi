import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Linking, StyleSheet } from 'react-native'

import { STABLE_BALANCE_SUPPORT_ARTICLE_URL } from '@fedi/common/constants/linking'

import CenterOverlay from '../../ui/CenterOverlay'
import { Column } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type ChatInfoOverlayProps = {
    onDismiss: () => void
    show?: boolean
}

const ChatInfoOverlay: React.FC<ChatInfoOverlayProps> = ({
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
                name="Info"
                size={SvgImageSize.lg}
                color={theme.colors.black}
            />
            <Column gap={theme.spacing.md}>
                <Text h2 bolder center>
                    {t('feature.chat.chat-info-title')}
                </Text>
                <Text>{t('feature.chat.chat-info-description')}</Text>
                <Text caption>
                    <Trans
                        t={t}
                        i18nKey="feature.chat.chat-info-note"
                        components={{
                            bold: <Text caption bold />,
                        }}
                    />
                </Text>
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
        learnMoreButton: {
            borderWidth: 1,
            borderRadius: 40,
            borderColor: theme.colors.lightGrey,
        },
    })

export default ChatInfoOverlay
