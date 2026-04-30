import { useTranslation } from 'react-i18next'

import { Row } from './Flex'
import { Icon, SvgIconName } from './Icon'
import { Text } from './Text'

type PaymentType = 'lightning' | 'onchain' | 'ecash'

export default function PaymentType({
    type,
    ...props
}: { type: PaymentType } & React.ComponentProps<typeof Row>) {
    const { t } = useTranslation()

    const paymentIconMap: Record<PaymentType, SvgIconName> = {
        lightning: 'Bolt',
        onchain: 'OnChainCircle',
        ecash: 'FediLogoIcon',
    }

    const paymentTextMap: Record<PaymentType, string> = {
        lightning: t('words.lightning'),
        onchain: t('words.onchain'),
        ecash: t('words.ecash'),
    }

    return (
        <Row center gap="xs" {...props}>
            <Icon icon={paymentIconMap[type]} size={16} />
            <Text weight="bold" variant="caption">
                {paymentTextMap[type]}
            </Text>
        </Row>
    )
}
