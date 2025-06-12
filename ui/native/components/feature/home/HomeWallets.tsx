import { useShouldShowStabilityPool } from '@fedi/common/hooks/federation'

import Flex from '../../ui/Flex'
import StabilityWallet from '../stabilitypool/StabilityWallet'
import BitcoinWallet from '../wallet/BitcoinWallet'

type Props = {
    offline: boolean
}
const HomeWallets = ({ offline }: Props) => {
    const showStabilityWallet = useShouldShowStabilityPool()

    return (
        <Flex gap="lg">
            <BitcoinWallet offline={offline} />
            {showStabilityWallet && <StabilityWallet />}
        </Flex>
    )
}

export default HomeWallets
