import { FunctionComponent, SVGAttributes } from 'react'
import { useTranslation } from 'react-i18next'

import BoltIcon from '@fedi/common/assets/svgs/bolt.svg'
import FediLogoIcon from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import OnchainCircleIcon from '@fedi/common/assets/svgs/on-chain-circle.svg'

import { Row } from './Flex'
import { Icon } from './Icon'
import { Text } from './Text'

type PaymentType = 'lightning' | 'onchain' | 'ecash'

export default function PaymentType({
    type,
    ...props
}: { type: PaymentType } & React.ComponentProps<typeof Row>) {
    const { t } = useTranslation()

    const paymentIconMap: Record<
        PaymentType,
        FunctionComponent<SVGAttributes<SVGElement>>
    > = {
        lightning: BoltIcon,
        onchain: OnchainCircleIcon,
        ecash: FediLogoIcon,
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
