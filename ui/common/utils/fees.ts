import { MSats } from '../types'
import { RpcFeeDetails } from '../types/bindings'

export function sumFeeDetails(feeDetails: RpcFeeDetails) {
    return (feeDetails.federationFee +
        feeDetails.networkFee +
        feeDetails.fediFee) as MSats
}
