import { useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import { useTranslation } from 'react-i18next'

import { useMultispendWithdrawalEventContent } from '@fedi/common/hooks/multispend'
import { MatrixEvent } from '@fedi/common/types'
import { MultispendEventContentType } from '@fedi/common/utils/matrix'

import Flex from '../../../ui/Flex'
import MultispendEventTemplate from './MultispendEventTemplate'

type Props = {
    event: MatrixEvent<MultispendEventContentType<'withdrawalRequest'>>
}

const MultispendWithdrawalEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()

    const { heading, senderName, formattedFiatAmount, text, subText } =
        useMultispendWithdrawalEventContent({
            t,
            event,
        })

    const navigation = useNavigation()

    const body1 = (
        <Flex gap="xs">
            <Text caption>
                <Text caption bold>
                    {senderName}{' '}
                </Text>
                <Text caption>{text}</Text>
                <Text caption bold>
                    {' '}
                    {formattedFiatAmount}
                </Text>
            </Text>
        </Flex>
    )

    return (
        <MultispendEventTemplate
            heading={heading}
            body={body1}
            footer={subText}
            button={{
                title: t('phrases.check-details'),
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

export default MultispendWithdrawalEvent
