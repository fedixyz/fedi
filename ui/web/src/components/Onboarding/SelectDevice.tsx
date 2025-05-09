import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import AndroidDeviceIcon from '@fedi/common/assets/svgs/device-android.svg'
import WebDeviceIcon from '@fedi/common/assets/svgs/device-browser.svg'
import IosDeviceIcon from '@fedi/common/assets/svgs/device-ios.svg'
import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import { useDeviceRegistration } from '@fedi/common/hooks/recovery'
import { setDeviceIndexRequired } from '@fedi/common/redux'
import { RpcRegisteredDevice } from '@fedi/common/types/bindings'
import { getFormattedDeviceInfo } from '@fedi/common/utils/device'

import { useAppDispatch } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { Header, Title } from '../Layout'
import { Text } from '../Text'
import { OnboardingContainer, OnboardingContent } from './components'

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
    const dispatch = useAppDispatch()

    const { registeredDevices, handleTransfer } = useDeviceRegistration(
        t,
        fedimint,
    )

    const onDeviceSelect = (device: RpcRegisteredDevice) => {
        handleTransfer(device, hasSetDisplayName => {
            dispatch(setDeviceIndexRequired(false))

            if (hasSetDisplayName) {
                router.push('/home')
            } else {
                router.push('/onboarding')
            }
        })
    }

    return (
        <OnboardingContainer>
            <Header back>
                <Title subheader>{t('feature.recovery.select-a-device')}</Title>
            </Header>
            <OnboardingContent fullWidth justify="start">
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
            </OnboardingContent>
        </OnboardingContainer>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
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
