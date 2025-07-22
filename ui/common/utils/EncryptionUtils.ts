import Hex from 'crypto-js/enc-hex'
import sha256 from 'crypto-js/sha256'

export const toSha256EncHex = (message: string): string => {
    return sha256(message).toString(Hex)
}
