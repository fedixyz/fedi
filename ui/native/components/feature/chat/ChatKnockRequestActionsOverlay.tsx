import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { MatrixRoomMember } from '@fedi/common/types'

import { AvatarSize } from '../../ui/Avatar'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column, Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import ChatAction from './ChatAction'
import ChatAvatar from './ChatAvatar'

interface Props {
    member: MatrixRoomMember | null
    isProcessing: boolean
    onAccept: (userId: string) => void
    onDecline: (userId: string) => void
    onDismiss: () => void
}

export const ChatKnockRequestActionsOverlay: React.FC<Props> = ({
    member,
    isProcessing,
    onAccept,
    onDecline,
    onDismiss,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    if (!member) return null

    return (
        <CustomOverlay
            show={!!member}
            onBackdropPress={onDismiss}
            contents={{
                title: (
                    <Row gap="xs" align="center">
                        <ChatAvatar
                            containerStyle={style.avatar}
                            user={member}
                            size={AvatarSize.sm}
                        />
                        <Text bold style={style.title}>
                            {member.displayName}
                        </Text>
                    </Row>
                ),
                body: (
                    <Column fullWidth>
                        <ChatAction
                            testID="KnockRequestAccept"
                            leftIcon={<SvgImage name="Check" />}
                            label={t('feature.chat.accept-knock')}
                            onPress={() => onAccept(member.id)}
                            isLoading={isProcessing}
                            disabled={isProcessing}
                        />
                        <ChatAction
                            testID="KnockRequestDecline"
                            leftIcon={
                                <SvgImage
                                    name="Close"
                                    color={theme.colors.red}
                                />
                            }
                            label={t('feature.chat.decline-knock')}
                            labelColor={theme.colors.red}
                            onPress={() => onDecline(member.id)}
                            isLoading={isProcessing}
                            disabled={isProcessing}
                        />
                    </Column>
                ),
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        title: {
            textAlign: 'center',
        },
        avatar: {
            marginRight: theme.spacing.xs,
        },
    })
