import * as device from '../../../utils/device'

describe('/utils/device', () => {
    describe('getFormattedDeviceInfo', () => {
        describe('When valid device identifier is provided', () => {
            it('should return correct response', () => {
                const deviceDetails = {
                    deviceIndex: 123,
                    deviceIdentifier:
                        'iPhone14,6:Mobile:996bd164-a49a-417a-8271-6f7d7029e06e',
                    lastRegistrationTimestamp: 1743750071,
                }

                const result = device.getFormattedDeviceInfo(deviceDetails)

                expect(result.deviceName).toBe('iOS - 996')
                expect(result.lastSeenAt).toContain('Apr 04')
                expect(result.iconName).toBe('DeviceIos')
            })
        })

        describe('When invalid device identifier is provided', () => {
            it('should return correct response', () => {
                const deviceDetails = {
                    deviceIndex: 123,
                    deviceIdentifier: 'invalid-identifier',
                    lastRegistrationTimestamp: 1743750071,
                }

                const result = device.getFormattedDeviceInfo(deviceDetails)

                expect(result.deviceName).toBe('Unknown')
                expect(result.lastSeenAt).toBe('-')
                expect(result.iconName).toBe('Error')
            })
        })
    })
})
