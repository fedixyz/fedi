class InvoiceUtils {
    // temporary function until decodeInvoice is available from FFI module
    getAmountFromInvoice = (invoice: string) => {
        const part = invoice.split('lnbcrt')[1]
        const prefixLocation = part.search(/\D/g)
        const amount = part.substring(0, prefixLocation)
        const prefix = part.substring(prefixLocation, prefixLocation + 1)
        const multiplier =
            prefix === 'm'
                ? 0.001
                : prefix === 'u'
                ? 0.000001
                : prefix === 'n'
                ? 0.000000001
                : 0.000000000001
        return Number(Number(amount) * multiplier * 100000000).toFixed(0)
    }

    formatExpiry = (expiryInSeconds: number): number => {
        // TODO: Format expiry to hours/seconds/minutes
        return expiryInSeconds
    }

    formatFee = (feeEstimate: FeeEstimate): string => {
        return `~${feeEstimate.minimum} - ${feeEstimate.maximum} ${feeEstimate.units}`
    }
}

type FeeEstimate = {
    minimum: number
    maximum: number
    units: string
}

const invoiceUtils = new InvoiceUtils()
export default invoiceUtils
