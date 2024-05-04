import { Buffer } from 'buffer'
import Hex from 'crypto-js/enc-hex'
import sha256 from 'crypto-js/sha256'
import { box, randomBytes } from 'tweetnacl'
import {
    decodeBase64,
    decodeUTF8,
    encodeBase64,
    encodeUTF8,
} from 'tweetnacl-util'

import { Key, Keypair } from '../types'

class EncryptionUtils {
    static newNonce = () => randomBytes(box.nonceLength)
    static bytes = (hex: string): Uint8Array => Buffer.from(hex, 'hex')
    generateDeterministicKeyPair = (seed: string): Keypair => {
        // Hash the keypair seed and use it to derive a keypair
        const keyPair = box.keyPair.fromSecretKey(this.sha256(seed))

        // Extract the public and private keys
        const publicKeyHex = Buffer.from(keyPair.publicKey).toString('hex')
        const privateKeyHex = Buffer.from(keyPair.secretKey).toString('hex')

        return {
            publicKey: {
                hex: publicKeyHex as string,
            },
            privateKey: {
                hex: privateKeyHex as string,
            },
        }
    }
    encryptMessage = (
        message: string,
        publicKey: Key,
        privateKey: Key,
    ): string => {
        const nonce = EncryptionUtils.newNonce()
        const messageUint8 = decodeUTF8(message)

        const sharedKey = box.before(
            EncryptionUtils.bytes(publicKey.hex),
            EncryptionUtils.bytes(privateKey.hex),
        )
        const encrypted = box.after(messageUint8, nonce, sharedKey)

        const fullMessage = new Uint8Array(nonce.length + encrypted.length)
        fullMessage.set(nonce)
        fullMessage.set(encrypted, nonce.length)

        const base64FullMessage = encodeBase64(fullMessage)
        return base64FullMessage
    }
    decryptMessage = (
        messageWithNonce: string,
        publicKey: Key,
        privateKey: Key,
    ): string => {
        const messageWithNonceAsUint8Array = decodeBase64(messageWithNonce)
        const nonce = messageWithNonceAsUint8Array.slice(0, box.nonceLength)
        const message = messageWithNonceAsUint8Array.slice(
            box.nonceLength,
            messageWithNonce.length,
        )

        const sharedKey = box.before(
            EncryptionUtils.bytes(publicKey.hex),
            EncryptionUtils.bytes(privateKey.hex),
        )
        const decrypted = box.open.after(message, nonce, sharedKey)

        if (!decrypted) {
            throw new Error('Could not decrypt message')
        }

        const base64DecryptedMessage = encodeUTF8(decrypted)

        return base64DecryptedMessage
    }
    private sha256 = (message: string): Uint8Array => {
        const wordArray = sha256(message)
        // Convert crypto-js WordArray to standard Uint8Array
        // Taken from https://github.com/brix/crypto-js/issues/274#issuecomment-600039187
        const l = wordArray.sigBytes
        const words = wordArray.words
        const result = new Uint8Array(l)
        let i = 0
        let j = 0
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (i == l) break
            const w = words[j++]
            result[i++] = (w & 0xff000000) >>> 24
            if (i == l) break
            result[i++] = (w & 0x00ff0000) >>> 16
            if (i == l) break
            result[i++] = (w & 0x0000ff00) >>> 8
            if (i == l) break
            result[i++] = w & 0x000000ff
        }
        return result
    }
    toSha256EncHex = (message: string): string => {
        return sha256(message).toString(Hex)
    }
}

const encryptionUtils = new EncryptionUtils()
export default encryptionUtils
