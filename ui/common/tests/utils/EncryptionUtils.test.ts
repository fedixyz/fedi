import encryptionUtils from '../../utils/EncryptionUtils'

describe('EncryptionUtils', () => {
    describe('generateDeterministicKeyPair', () => {
        it('should always produce the same keypair given the same seed', async () => {
            const seed =
                'c35bcaf57e51dac29817792cc086f32d09651ed5328dde48c8b4959c871330c1'
            const keypair1 =
                await encryptionUtils.generateDeterministicKeyPair(seed)
            const keypair2 =
                await encryptionUtils.generateDeterministicKeyPair(seed)

            expect(keypair1.publicKey).toEqual(keypair2.publicKey)
            expect(keypair1.privateKey).toEqual(keypair2.privateKey)
        })
        it('should produce different keypairs given different seeds', async () => {
            const uniqueSeed1 =
                '135bcaf57e51dac29817792cc086f32d09651ed5328dde48c8b4959c871330c2'
            const uniqueSeed2 =
                '235bcaf57e51dac29817792cc086f32d09651ed5328dde48c8b4959c871330c2'

            const keypair1 =
                await encryptionUtils.generateDeterministicKeyPair(uniqueSeed1)
            const keypair2 =
                await encryptionUtils.generateDeterministicKeyPair(uniqueSeed2)

            expect(keypair1.publicKey).not.toContain(keypair2.publicKey)
            expect(keypair2.publicKey).not.toContain(keypair1.publicKey)
            expect(keypair1.privateKey).not.toContain(keypair2.privateKey)
            expect(keypair2.privateKey).not.toContain(keypair1.privateKey)
        })
    })
    describe('encryptMessage', () => {
        it('should produce different values given constant inputs due to random nonce generation', async () => {
            const aliceKp = await encryptionUtils.generateDeterministicKeyPair(
                'c35bcaf57e51dac29817792cc086f32d09651ed5328dde48c8b4959c871330c2',
            )
            const bobKp = await encryptionUtils.generateDeterministicKeyPair(
                '328dde48c8c35bcaf57c086f32d09651e328dde48c8d5328dde48c8b0c212asf',
            )

            const unencryptedMessage = 'a secret message'

            const encryptedMessage = encryptionUtils.encryptMessage(
                unencryptedMessage,
                bobKp.publicKey,
                aliceKp.privateKey,
            )
            const encryptedMessageAgain = encryptionUtils.encryptMessage(
                unencryptedMessage,
                bobKp.publicKey,
                aliceKp.privateKey,
            )

            expect(encryptedMessage).not.toEqual(encryptedMessageAgain)
        })
    })
    describe('basic end-to-end encryption', () => {
        it('should successfully encrypt and decrypt given 2 pairs of keys', async () => {
            const aliceKp = await encryptionUtils.generateDeterministicKeyPair(
                'c35bcaf57e51dac29817792cc086f32d09651ed5328dde48c8b4959c871330c2',
            )
            const bobKp = await encryptionUtils.generateDeterministicKeyPair(
                '328dde48c8c35bcaf57c086f32d09651e328dde48c8d5328dde48c8b0c212asf',
            )

            // Original unencrypted message to be sent from Alice to Bob
            const messageToBob = 'a secret message'

            // Alice encrypts the message with her privkey and Bob's pubkey
            const encryptedMessageToBob = encryptionUtils.encryptMessage(
                messageToBob,
                bobKp.publicKey,
                aliceKp.privateKey,
            )

            // Encrypted message should never have the original message
            expect(encryptedMessageToBob).not.toEqual(messageToBob)
            expect(encryptedMessageToBob).not.toContain(messageToBob)

            // Bob decrypts the message with his privkey and Alice's pubkey
            const decryptedMessageFromAlice = encryptionUtils.decryptMessage(
                encryptedMessageToBob,
                aliceKp.publicKey,
                bobKp.privateKey,
            )

            // Original message and decrypted message should match
            expect(messageToBob).toEqual(decryptedMessageFromAlice)
        })
        it('should fail to decrypt without the correct keys', async () => {
            const aliceKp = await encryptionUtils.generateDeterministicKeyPair(
                'c35bcaf57e51dac29817792cc086f32d09651ed5328dde48c8b4959c871330c2',
            )
            const bobKp = await encryptionUtils.generateDeterministicKeyPair(
                '328dde48c8c35bcaf57c086f32d09651e328dde48c8d5328dde48c8b0c212asf',
            )
            const eveKp = await encryptionUtils.generateDeterministicKeyPair(
                '5bcaf328e328de42d028dde48d58b0c3sf4086d8c28c5ddef3517c12a98c368c',
            )

            // Original unencrypted message to be sent from Alice to Bob
            const messageToBob = 'a secret message'

            // Alice encrypts the message with her privkey and Bob's pubkey
            const encryptedMessageToBob = encryptionUtils.encryptMessage(
                messageToBob,
                bobKp.publicKey,
                aliceKp.privateKey,
            )

            // Encrypted message should never have the original message
            expect(encryptedMessageToBob).not.toEqual(messageToBob)
            expect(encryptedMessageToBob).not.toContain(messageToBob)

            // Eve fails to decrypt the message with her privkey and Alice's pubkey
            expect(() => {
                encryptionUtils.decryptMessage(
                    encryptedMessageToBob,
                    aliceKp.publicKey,
                    eveKp.privateKey,
                )
            }).toThrow()
        })
    })
})
