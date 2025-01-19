import { Theme, useTheme } from '@rneui/themed'
import { StyleSheet } from 'react-native'

import { FederationStatus } from '@fedi/common/types'

import SvgImage, { SvgImageName } from '../../ui/SvgImage'

type Props = {
    status: FederationStatus
    size?: number
}

const STATUS_ICONS: Record<FederationStatus, SvgImageName> = {
    unstable: 'Info',
    offline: 'AlertWarningTriangle',
    online: 'Online',
}

export const ConnectionIcon = ({ status, size = 12 }: Props) => {
    const { theme } = useTheme()
    const icon = STATUS_ICONS[status]
    const style = styles(theme)
    const color =
        status === 'online' ? theme.colors.success : theme.colors.error
    return (
        <SvgImage
            size={size}
            name={icon}
            color={color}
            containerStyle={status === 'online' ? style.shadow : {}}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        shadow: {
            shadowColor: theme.colors.red,
            shadowOffset: {
                width: 0,
                height: 0,
            },
            shadowOpacity: 0.8,
            shadowRadius: 2,
        },
        smallContainer: {
            height: theme.sizes.xs,
        },
        smallText: {
            lineHeight: 15,
        },
    })
