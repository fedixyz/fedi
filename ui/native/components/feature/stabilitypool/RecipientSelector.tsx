import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { ReceiverType } from '../../../screens/StabilityTransfer'
import { AvatarSize } from '../../ui/Avatar'
import { Column, Row } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import ChatAvatar from '../chat/ChatAvatar'
import RecipientSelectorOverlay from './RecipientSelectorOverlay'

const RecipientSelector: React.FC<{
    receiver: ReceiverType | null
    setReceiver: (receiver: ReceiverType | null) => void
}> = ({ receiver, setReceiver }) => {
    const { theme } = useTheme()
    const [opened, setOpened] = useState<boolean>(false)
    const { t } = useTranslation()
    const style = styles(theme)

    return (
        <>
            <Pressable style={style.container} onPress={() => setOpened(true)}>
                <Column
                    align="stretch"
                    justify="center"
                    gap="xs"
                    fullWidth
                    style={style.content}>
                    <Row grow align="center" justify="between">
                        {receiver ? (
                            <Row grow align="center">
                                <ChatAvatar
                                    containerStyle={[style.avatar]}
                                    user={receiver}
                                    size={AvatarSize.xs}
                                />
                                <Text
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    caption
                                    medium>
                                    {receiver.displayName}
                                </Text>
                            </Row>
                        ) : (
                            <Text caption color={theme.colors.grey400}>
                                {t('feature.stabilitypool.select-receiver')}
                            </Text>
                        )}
                        <Row align="center" gap="xs">
                            <SvgImage
                                name="ChevronRight"
                                size={SvgImageSize.sm}
                                containerStyle={{
                                    transform: [
                                        { rotate: '90deg' },
                                        { translateX: 2 },
                                    ],
                                }}
                            />
                        </Row>
                    </Row>
                </Column>
            </Pressable>
            <RecipientSelectorOverlay
                opened={opened}
                onDismiss={() => setOpened(false)}
                onSelect={setReceiver}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.lightGrey,
            alignSelf: 'stretch',
            marginBottom: theme.spacing.xs,
        },
        content: {
            paddingHorizontal: theme.spacing.xs,
        },
        avatar: {
            marginRight: theme.spacing.md,
            backgroundColor: theme.colors.orange,
        },
    })

export default RecipientSelector
