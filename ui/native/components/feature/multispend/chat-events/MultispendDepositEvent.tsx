import { useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import { useTranslation } from 'react-i18next'

import { useMultispendDepositEventContent } from '@fedi/common/hooks/multispend'
import { MatrixEvent } from '@fedi/common/types'
import { MultispendEventContentType } from '@fedi/common/utils/matrix'

import Flex from '../../../ui/Flex'
import MultispendEventTemplate from './MultispendEventTemplate'

type Props = {
    event: MatrixEvent<MultispendEventContentType<'depositNotification'>>
}

const MultispendDepositEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()

    const { heading, senderName, formattedFiatAmount } =
        useMultispendDepositEventContent({
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
                <Text caption>
                    {t('feature.multispend.chat-events.deposit-body')}
                </Text>
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
            button={{
                title: t('phrases.check-details'),
                onPress: () => {
                    // TODO: target specific event on screen when it's finished
                    navigation.navigate('MultispendTransactions', {
                        roomId: event.roomId,
                    })
                },
            }}
        />
    )
}

export default MultispendDepositEvent
