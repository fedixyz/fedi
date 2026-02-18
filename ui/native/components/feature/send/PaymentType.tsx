import { Text } from '@rneui/themed'
import { useTranslation } from 'react-i18next'

import { Row } from '../../ui/Flex'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'

type PaymentType = 'onchain' | 'lightning' | 'ecash'

export default function PaymentType({
    type,
    ...props
}: { type: PaymentType } & React.ComponentProps<typeof Row>) {
    const { t } = useTranslation()

    const paymentIconMap: Record<PaymentType, SvgImageName> = {
        onchain: 'Network',
        lightning: 'Bolt',
        ecash: 'FediLogoIcon',
    }

    const paymentTextMap: Record<PaymentType, string> = {
        onchain: t('words.onchain'),
        lightning: t('words.lightning'),
        ecash: t('words.ecash'),
    }

    return (
        <Row center gap="xs" {...props}>
            <SvgImage name={paymentIconMap[type]} size={16} />
            <Text bold caption>
                {paymentTextMap[type]}
            </Text>
        </Row>
    )
}
