import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { MatrixRoomMember } from '@fedi/common/types'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { AvatarSize } from '../../ui/Avatar'
import { Column, Row } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import ChatAvatar from './ChatAvatar'

type Props = {
    member: MatrixRoomMember
    onPress: (userId: string) => void
    testID?: string
}

const ChatPendingRequestTile: React.FC<Props> = ({
    member,
    onPress,
    testID,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    const suffix = useMemo(() => getUserSuffix(member.id), [member.id])

    return (
        <Pressable
            testID={testID}
            containerStyle={style.container}
            onPress={() => onPress(member.id)}>
            <Row align="center" gap="md" fullWidth>
                <View>
                    <ChatAvatar user={member} size={AvatarSize.md} />
                    <View style={style.statusDot} />
                </View>
                <Column shrink>
                    <Row align="center">
                        <Text bold numberOfLines={1} style={style.name}>
                            {member.displayName}
                        </Text>
                        <Text bold caption color={theme.colors.grey}>
                            {suffix}
                        </Text>
                    </Row>
                    <Text small color={theme.colors.grey}>
                        {t('feature.chat.requested-to-join')}
                    </Text>
                </Column>
            </Row>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: theme.colors.orange200,
            borderRadius: theme.borders.defaultRadius,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.md,
            marginBottom: theme.spacing.sm,
        },
        name: {
            flexShrink: 1,
            paddingRight: theme.spacing.xs,
        },
        statusDot: {
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: theme.colors.white,
            backgroundColor: theme.colors.orange,
        },
    })

export default ChatPendingRequestTile
