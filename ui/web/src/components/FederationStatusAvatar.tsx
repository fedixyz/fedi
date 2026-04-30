import { styled } from '@stitches/react'
import { useTranslation } from 'react-i18next'

import { theme } from '@fedi/common/constants/theme'
import {
    useFederationStatus,
    usePopupFederationInfo,
} from '@fedi/common/hooks/federation'
import { LoadedFederation } from '@fedi/common/types'

import { AvatarProps } from './Avatar'
import { FederationAvatar } from './FederationAvatar'
import { Icon, SvgIconName } from './Icon'

export default function FederationStatusAvatar({
    size = 'sm',
    federation,
}: {
    size?: AvatarProps['size']
    federation: LoadedFederation
}) {
    const { t } = useTranslation()

    const popupInfo = usePopupFederationInfo(federation.meta ?? {})
    const { status, statusIcon, statusIconColor } =
        useFederationStatus<SvgIconName>({
            federationId: federation.id,
            t,
            statusIconMap: {
                online: 'Dot',
                unstable: 'Dot',
                offline: 'Dot',
            },
        })

    const shouldShowDot = status !== 'online' || popupInfo

    return (
        <AvatarContainer size={size}>
            <FederationAvatar federation={federation} size={size} />
            {shouldShowDot && (
                <EndedIndicator>
                    <Icon icon={statusIcon} size={16} color={statusIconColor} />
                </EndedIndicator>
            )}
        </AvatarContainer>
    )
}

const AvatarContainer = styled('div', {
    position: 'relative',
    display: 'flex',
    overflow: 'visible',
    variants: {
        size: {
            xs: {
                width: 20,
                height: 20,
            },
            sm: {
                width: 32,
                height: 32,
            },
            md: {
                width: 48,
                height: 48,
            },
            lg: {
                width: 88,
                height: 88,
            },
        },
    },
})

const EndedIndicator = styled('div', {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: theme.colors.white,
    borderRadius: 1024,
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
})
