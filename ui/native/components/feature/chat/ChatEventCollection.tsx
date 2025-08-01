import { Text, Theme, useTheme } from '@rneui/themed'
import isEqual from 'lodash/isEqual'
import React, { memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import dateUtils from '@fedi/common/utils/DateUtils'

import { MatrixEvent } from '../../../types'
import Flex from '../../ui/Flex'
import ChatEventTimeFrame from './ChatEventTimeFrame'

interface Props {
    roomId: string
    collection: MatrixEvent[][]
    onSelect: (userId: string) => void
    showUsernames?: boolean
    isPublic?: boolean
}

const ChatEventCollection: React.FC<Props> = memo(
    ({ roomId, collection, onSelect, showUsernames, isPublic }: Props) => {
        const { theme } = useTheme()

        const earliestEvent = useMemo(
            () => collection.slice(-1)[0].slice(-1)[0],
            [collection],
        )

        const style = useMemo(() => styles(theme), [theme])

        return (
            <View style={style.container}>
                {earliestEvent.timestamp && (
                    <Flex
                        align="center"
                        fullWidth
                        style={style.timestampContainer}>
                        <Text tiny style={style.timestampText}>
                            {dateUtils.formatMessageItemTimestamp(
                                earliestEvent.timestamp / 1000,
                            )}
                        </Text>
                    </Flex>
                )}
                <Flex columnReverse>
                    {collection.map(events => (
                        <ChatEventTimeFrame
                            key={events.at(-1)?.eventId}
                            events={events}
                            roomId={roomId}
                            showUsernames={showUsernames}
                            isPublic={isPublic}
                            onSelect={onSelect}
                        />
                    ))}
                </Flex>
            </View>
        )
    },
    (prev, curr) => isEqual(prev.collection, curr.collection),
)

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            marginBottom: theme.spacing.md,
            color: theme.colors.darkGrey,
        },
        timestampContainer: {
            marginBottom: theme.spacing.md,
        },
        timestampText: {
            color: theme.colors.darkGrey,
        },
    })

export default ChatEventCollection
