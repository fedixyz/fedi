import { Button, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { LoadedFederation } from '@fedi/common/types'

import { Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type Override = {
    onPress?: () => void
    disabled?: boolean
}

export type WalletButtonsProps = {
    incoming?: Override
    outgoing?: Override
    history?: Override
    federation: LoadedFederation
}

const WalletButtons: React.FC<WalletButtonsProps> = ({
    incoming = {},
    outgoing = {},
    history = {},
    federation,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})

    if (!federation) return null

    const handleIncoming = () => {
        if (incoming.onPress) return incoming.onPress()
    }

    const handleOutgoing = () => {
        if (outgoing.onPress) return outgoing.onPress()
    }

    const handleHistory = () => {
        if (history.onPress) return history.onPress()
    }

    return (
        <Row center gap="lg">
            <Button
                bubble
                outline
                size="sm"
                disabled={incoming.disabled || popupInfo?.ended}
                onPress={handleIncoming}
                icon={<SvgImage name="ArrowDown" />}
                containerStyle={style.buttonContainer}
                buttonStyle={style.button}
            />
            <Button
                bubble
                outline
                size="sm"
                disabled={outgoing.disabled || popupInfo?.ended}
                onPress={handleOutgoing}
                icon={<SvgImage name="ArrowUpRight" />}
                containerStyle={style.buttonContainer}
                buttonStyle={style.button}
            />
            <Button
                bubble
                outline
                size="sm"
                disabled={popupInfo?.ended}
                onPress={handleHistory}
                icon={<SvgImage name="TxnHistory" />}
                containerStyle={style.circleButtonContainer}
                buttonStyle={style.button}
            />
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        buttonContainer: {
            flex: 1,
        },
        button: {
            gap: theme.spacing.sm,
        },
        circleButtonContainer: {
            flex: 0,
            height: theme.sizes.circleButtonSize,
            width: theme.sizes.circleButtonSize,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default WalletButtons
