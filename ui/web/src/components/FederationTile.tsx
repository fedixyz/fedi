import Link from 'next/link'
import React from 'react'
import { useTranslation } from 'react-i18next'

import chevronRight from '@fedi/common/assets/svgs/chevron-right.svg'
import dot from '@fedi/common/assets/svgs/dot.svg'
import exclamationCircle from '@fedi/common/assets/svgs/exclamation-circle.svg'
import {
    useFederationStatus,
    usePopupFederationInfo,
} from '@fedi/common/hooks/federation'
import { selectIsFederationRecovering } from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'

import { federationRoute } from '../constants/routes'
import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { BitcoinWallet } from './BitcoinWallet'
import { FederationAvatar } from './FederationAvatar'
import { Icon } from './Icon'
import { RecoveryInProgress } from './RecoveryInProgress'
import { Text } from './Text'

type Props = {
    federation: LoadedFederation
    expanded: boolean
    setExpandedWalletId: (id: string | null) => void
}

const FederationTile: React.FC<Props> = ({
    federation,
    expanded,
    setExpandedWalletId,
}) => {
    const { t } = useTranslation()
    const recoveryInProgress = useAppSelector(s =>
        selectIsFederationRecovering(s, federation.id),
    )
    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})

    const { status, statusIcon, statusIconColor } = useFederationStatus({
        federationId: federation.id,
        t,
        statusIconMap: {
            online: dot,
            unstable: dot,
            offline: dot,
        },
    })

    return (
        <Container>
            <TileHeader as={Link} href={federationRoute(federation.id)}>
                <LogoContainer>
                    <FederationAvatar federation={federation} size="md" />
                    {(popupInfo?.ended || status !== 'online') && (
                        <EndedIndicator>
                            <Icon
                                icon={
                                    popupInfo?.ended
                                        ? exclamationCircle
                                        : statusIcon
                                }
                                size="xs"
                                color={statusIconColor}
                            />
                        </EndedIndicator>
                    )}
                </LogoContainer>
                <Text weight="bold" css={{ color: theme.colors.primary }}>
                    {federation?.name}
                </Text>
                <IconContainer>
                    <Icon icon={chevronRight} size={'sm'} />
                </IconContainer>
            </TileHeader>
            {recoveryInProgress ? (
                <RecoveryContainer>
                    <RecoveryInProgress
                        label={t(
                            'feature.recovery.recovery-in-progress-balance',
                        )}
                        federationId={federation.id}
                    />
                </RecoveryContainer>
            ) : (
                <BitcoinWallet
                    federation={federation}
                    expanded={expanded}
                    setExpandedWalletId={setExpandedWalletId}
                />
            )}
        </Container>
    )
}

const LogoContainer = styled('div', {
    position: 'relative',
    width: 48,
    height: 48,
})

const EndedIndicator = styled('div', {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 16,
    height: 16,
    backgroundColor: theme.colors.white,
    borderRadius: 1024,
    alignItems: 'center',
    justifyContent: 'center',
})

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const TileHeader = styled('div', {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
})

const IconContainer = styled('button', {
    marginLeft: 'auto',
})

const RecoveryContainer = styled('div', {
    minHeight: 120,
    borderRadius: 20,
    border: `1px solid ${theme.colors.extraLightGrey}`,
})

export default FederationTile
