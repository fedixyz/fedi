import { Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import {
    useFederationStatus,
    usePopupFederationInfo,
} from '@fedi/common/hooks/federation'

import { LoadedFederation } from '../../../types'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'
import { FederationLogo } from './FederationLogo'

export default function FederationStatusAvatar({
    size = 36,
    federation,
}: {
    size?: number
    federation: LoadedFederation
}) {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const popupInfo = usePopupFederationInfo(federation.meta ?? {})
    const { status, statusIcon, statusIconColor } =
        useFederationStatus<SvgImageName>({
            federationId: federation.id,
            t,
            statusIconMap: {
                online: 'Dot',
                unstable: 'Dot',
                offline: 'Dot',
            },
        })

    // If `popupInfo` is present, that means the federation is either ending or ended
    const shouldShowDot = status !== 'online' || popupInfo

    const style = styles(theme)

    return (
        <View style={[style.logoContainer, { width: size, height: size }]}>
            <FederationLogo federation={federation} size={size} />
            {shouldShowDot && (
                <View style={style.endedIndicator}>
                    <SvgImage
                        name={
                            popupInfo?.ended
                                ? 'ExclamationCircle'
                                : // When the federation is ending, we show a clock icon
                                  popupInfo
                                  ? 'Clock'
                                  : statusIcon
                        }
                        size={16}
                        color={statusIconColor}
                    />
                </View>
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        logoContainer: {
            position: 'relative',
        },
        endedIndicator: {
            position: 'absolute',
            top: -6,
            right: -6,
            backgroundColor: theme.colors.white,
            borderRadius: 1024,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })
