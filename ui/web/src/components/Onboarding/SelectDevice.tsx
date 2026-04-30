import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useDeviceRegistration } from '@fedi/common/hooks/recovery'
import { RpcRegisteredDevice } from '@fedi/common/types/bindings'
import { getFormattedDeviceInfo } from '@fedi/common/utils/device'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { HoloLoader } from '../HoloLoader'
import { Icon, SvgIconName } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'

const getIcon = (iconName: string): SvgIconName => {
    switch (iconName) {
        case 'DeviceBrowser':
            return 'DeviceBrowser'
        case 'DeviceIos':
            return 'DeviceIos'
        case 'DeviceAndroid':
            return 'DeviceAndroid'
        default:
            return 'Error'
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

    const {
        isLoadingRegisteredDevices,
        isProcessing,
        isResettingSeed,
        registeredDevices,
        handleContinueWithDefaultDevice,
        handleResetUnrecognizedSeed,
        handleTransfer,
    } = useDeviceRegistration(t)

    const onDeviceSelect = (device: RpcRegisteredDevice) => {
        handleTransfer(device, () => {
            router.push('/home')
        })
    }

    const handleTryAgain = async () => {
        await handleResetUnrecognizedSeed(() => {
            router.push('/onboarding/recover')
        })
    }

    const handleContinueAnyway = () => {
        handleContinueWithDefaultDevice(() => {
            router.push('/home')
        })
    }

    if (isProcessing || isLoadingRegisteredDevices) {
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
                        <>
                            <IconWrap>
                                <Icon icon="Error" size="sm" />
                            </IconWrap>
                            <Text center variant="h2">
                                {t('feature.recovery.device-not-found')}
                            </Text>
                            <Text
                                center
                                variant="body"
                                css={{ color: theme.colors.darkGrey }}>
                                {t(
                                    'feature.recovery.device-not-found-description',
                                )}
                            </Text>
                            <Actions>
                                <Button
                                    width="full"
                                    onClick={handleTryAgain}
                                    loading={isResettingSeed}
                                    disabled={isProcessing}>
                                    {t('phrases.start-over')}
                                </Button>
                                <Button
                                    width="full"
                                    variant="secondary"
                                    onClick={handleContinueAnyway}
                                    loading={isProcessing}
                                    disabled={isResettingSeed}>
                                    {t('feature.recovery.continue-anyways')}
                                </Button>
                            </Actions>
                        </>
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

const IconWrap = styled('div', {
    alignItems: 'center',
    background: theme.colors.white,
    border: `1px solid ${theme.colors.lightGrey}`,
    borderRadius: '999px',
    display: 'flex',
    height: 56,
    justifyContent: 'center',
    width: 56,
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

const Actions = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
})
