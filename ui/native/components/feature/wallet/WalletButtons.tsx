import { Button, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Animated } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { LoadedFederation } from '@fedi/common/types'

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
    expanded?: boolean
}

const WalletButtons: React.FC<WalletButtonsProps> = ({
    incoming = {},
    outgoing = {},
    history = {},
    federation,
    expanded = false,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})

    // even with maxHeight: 0 the Animated.View is still rendered and will
    // affect the parent flexbox layout so we need to make sure that:
    // - before the animation we apply display: flex (expanded)
    // - after the animation we apply display: none (collapsed)
    const expansionAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current
    const [isAnimating, setIsAnimating] = useState(expanded)
    const displayStyle = expanded || isAnimating ? 'flex' : 'none'
    useEffect(() => {
        if (expanded) {
            // Before expanding: set display: 'flex'
            setIsAnimating(true)
        }

        Animated.timing(expansionAnim, {
            toValue: expanded ? 1 : 0,
            duration: 300,
            useNativeDriver: false,
        }).start(() => {
            if (!expanded) {
                setIsAnimating(false)
            }
        })
    }, [expanded, expansionAnim])

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

    const buttonsHeight = expansionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 120],
    })
    const buttonsOpacity = expansionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    })

    return (
        <Animated.View
            style={{
                maxHeight: buttonsHeight,
                opacity: buttonsOpacity,
                overflow: 'hidden',
                display: displayStyle,
                flexDirection: 'row',
                gap: theme.spacing.lg,
                alignItems: 'center',
            }}>
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
        </Animated.View>
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
