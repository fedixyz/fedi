import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type Props = {
    isBroadcast?: boolean
    isDefault?: boolean
}

const NoMessagesNotice: React.FC<Props> = ({
    isBroadcast = false,
    isDefault = false,
}: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    return (
        <Flex grow center gap="lg">
            <SvgImage name="ChatThin" size={70} color={theme.colors.grey} />
            {isBroadcast ? (
                <Text medium style={styles(theme).text}>
                    {t('feature.chat.broadcast-no-message')}
                </Text>
            ) : (
                <Text medium style={styles(theme).text}>
                    {t('feature.chat.no-messages')}
                    {'\r'}
                    {isDefault
                        ? null
                        : t('feature.chat.start-the-conversation')}
                </Text>
            )}
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        icon: {
            height: theme.sizes.lg,
            width: theme.sizes.lg,
            marginTop: theme.spacing.xl,
            paddingTop: theme.spacing.xl,
            marginBottom: theme.spacing.md,
        },
        text: {
            maxWidth: 320,
            color: theme.colors.grey,
            textAlign: 'center',
            lineHeight: 20,
            fontFamily: 'Albert Sans',
            letterSpacing: 0.5,
            paddingHorizontal: theme.spacing.xl,
        },
    })

export default NoMessagesNotice
