import { useShouldShowStabilityPool } from '@fedi/common/hooks/federation'
import { LoadedFederation } from '@fedi/common/types/fedimint'

import Flex from '../../ui/Flex'
import StabilityWallet from '../stabilitypool/StabilityWallet'
import BitcoinWallet from '../wallet/BitcoinWallet'

type Props = {
    federation: LoadedFederation
}
const HomeWallets = ({ federation }: Props) => {
    const showStabilityWallet = useShouldShowStabilityPool(federation.id)

    return (
        <Flex gap="lg">
            <BitcoinWallet federation={federation} />
            {showStabilityWallet && <StabilityWallet federation={federation} />}
        </Flex>
    )
}

export default HomeWallets
