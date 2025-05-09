import { useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useMultispendInvitationEventContent } from '@fedi/common/hooks/multispend'
import { useCommonSelector } from '@fedi/common/hooks/redux'
import { selectMatrixRoomMember } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { RpcMultispendGroupStatus } from '@fedi/common/types/bindings'
import { MultispendEventContentType } from '@fedi/common/utils/matrix'

import MultispendEventTemplate from './MultispendEventTemplate'

type Props = {
    event: MatrixEvent<MultispendEventContentType<'groupInvitation'>>
}

const getInvitationStatusText = (
    t: TFunction,
    status: RpcMultispendGroupStatus['status'],
) => {
    if (status === 'inactive') {
        return {
            statusText: `❌ ${t('words.failed')}`,
            statusDescription: t(
                'feature.multispend.chat-events.invitation-failed',
            ),
        }
    } else if (status === 'finalized') {
        return {
            statusText: `✅ ${t('words.active')}`,
        }
    } else {
        return {
            statusText: `⏳ ${t('feature.multispend.waiting-for-approval')}`,
        }
    }
}

const MultispendInvitationEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()

    const { status, threshold, proposer, hasVoted, role, voters } =
        useMultispendInvitationEventContent(event)

    const { statusText, statusDescription } = getInvitationStatusText(t, status)

    const proposerMember = useCommonSelector(s =>
        proposer
            ? selectMatrixRoomMember(s, event.roomId, proposer)
            : undefined,
    )

    const proposerName = proposerMember
        ? proposerMember.membership === 'leave'
            ? 'Left User'
            : proposerMember.displayName
        : 'User'

    const navigation = useNavigation()

    const body1 = (
        <View style={{ gap: 4 }}>
            {status === 'activeInvitation' && (
                <Text caption>
                    <Text caption bold>
                        {proposerName}{' '}
                    </Text>
                    <Text caption>
                        {t('feature.multispend.chat-events.invitation-body1')}
                    </Text>
                </Text>
            )}
            <Text caption>
                {t('feature.multispend.chat-events.invitation-body1-bullet1', {
                    name: event.content.invitation.federationName,
                })}
            </Text>
            <Text caption>
                {t('feature.multispend.chat-events.invitation-body1-bullet2', {
                    threshold,
                    votes: voters,
                })}
            </Text>
            <Text caption style={style.bullet}>
                <Text caption>
                    {'\u2022'} {t('words.status')}:{' '}
                </Text>
                <Text caption bold>
                    {statusText}
                    {'. '}
                </Text>
                {statusDescription && <Text caption>{statusDescription}</Text>}
            </Text>
        </View>
    )

    const body2 =
        status === 'activeInvitation' && role === 'proposer'
            ? t('feature.multispend.chat-events.invitation-body2-proposer')
            : status === 'activeInvitation' && role === 'voter' && !hasVoted
              ? t('feature.multispend.chat-events.invitation-body2')
              : undefined

    const buttonText =
        hasVoted || role !== 'voter'
            ? t('phrases.check-details')
            : t('words.review')

    return (
        <MultispendEventTemplate
            heading={t('feature.multispend.chat-events.message-header')}
            body={body1}
            footer={body2}
            button={{
                title: buttonText,
                onPress: () => {
                    // TODO: target specific event on screen when it's finished
                    navigation.navigate('GroupMultispend', {
                        roomId: event.roomId,
                    })
                },
            }}
        />
    )
}

export default MultispendInvitationEvent

const style = StyleSheet.create({
    bullet: {
        // Emoji's throw off the line height
        lineHeight: 18,
    },
})
