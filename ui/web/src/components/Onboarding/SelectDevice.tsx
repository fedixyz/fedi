import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import AndroidDeviceIcon from '@fedi/common/assets/svgs/device-android.svg'
import WebDeviceIcon from '@fedi/common/assets/svgs/device-browser.svg'
import IosDeviceIcon from '@fedi/common/assets/svgs/device-ios.svg'
import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import { useDeviceRegistration } from '@fedi/common/hooks/recovery'
import { RpcRegisteredDevice } from '@fedi/common/types/bindings'
import { getFormattedDeviceInfo } from '@fedi/common/utils/device'

import { styled, theme } from '../../styles'
import { HoloLoader } from '../HoloLoader'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'

const getIcon = (iconName: string) => {
    switch (iconName) {
        case 'DeviceBrowser':
            return WebDeviceIcon
        case 'DeviceIos':
            return IosDeviceIcon
        case 'DeviceAndroid':
            return AndroidDeviceIcon
        default:
            return ErrorIcon
    }
}

const renderDevice = (
    device: RpcRegisteredDevice,
    handler: (device: RpcRegisteredDevice) => void,
) => {
    const { deviceName, iconName, lastSeenAt } = getFormattedDeviceInfo(device)

    return (
        <Device key={device.deviceIndex} onClick={() => handler(device)}>
            <DeviceIconWrapper>
                <Icon icon={getIcon(iconName)} />
            </DeviceIconWrapper>
            <DeviceContent>
                <Text variant="caption" weight="medium">
                    {deviceName}
                </Text>
                <Text variant="small" css={{ color: theme.colors.darkGrey }}>
                    {lastSeenAt}
                </Text>
            </DeviceContent>
        </Device>
    )
}

export const SelectDevice: React.FC = () => {
    const { t } = useTranslation()
    const router = useRouter()

    const { isProcessing, registeredDevices, handleTransfer } =
        useDeviceRegistration(t)

    const onDeviceSelect = (device: RpcRegisteredDevice) => {
        handleTransfer(device, () => {
            router.push('/home')
        })
    }

    if (isProcessing) {
        return (
            <LoadingWrapper>
                <HoloLoader size={'xl'} />
            </LoadingWrapper>
        )
    }

    return (
        <Layout.Root>
            <Layout.Header back>
                <Layout.Title subheader>
                    {t('feature.recovery.select-a-device')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Content>
                    {registeredDevices.length === 0 ? (
                        <Text variant="body">
                            {t('feature.recovery.no-devices-found')}
                        </Text>
                    ) : (
                        <Devices>
                            <Text variant="body">
                                {t('feature.recovery.select-a-device-guidance')}
                            </Text>
                            {registeredDevices.map(device =>
                                renderDevice(device, onDeviceSelect),
                            )}
                        </Devices>
                    )}
                </Content>
            </Layout.Content>
        </Layout.Root>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 20,
    textAlign: 'left',
})

const Devices = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
})

const Device = styled('div', {
    alignItems: 'center',
    background: theme.colors.offWhite,
    borderRadius: 10,
    boxSizing: 'border-box',
    cursor: 'pointer',
    display: 'flex',
    minHeight: 50,
    padding: 10,
})

const DeviceContent = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    marginLeft: 10,
    textAlign: 'left',
})

const DeviceIconWrapper = styled('div', {
    alignItems: 'center',
    background: theme.colors.white,
    borderRadius: '50%',
    display: 'flex',
    height: 40,
    justifyContent: 'center',
    width: 40,
})

const LoadingWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
})
