import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native'

import { LoadedFederation } from '@fedi/common/types'
import { getFederationIconUrl } from '@fedi/common/utils/FederationUtils'

import { Images } from '../../../assets/images'
import { Column } from '../../ui/Flex'
import HexImage from '../../ui/HexImage'
import { RemoteIcon } from '../../ui/RemoteIcon'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type Props = {
    federation?: Pick<LoadedFederation, 'id' | 'meta'>
    size: SvgImageSize | number
    shape?: 'square' | 'hex' | 'circle'
    radius?: number
    /** Also drawn when the published icon cannot be loaded. */
    fallback?: React.ReactNode
}

export const FederationLogo: React.FC<Props> = ({
    federation,
    size,
    shape = 'square',
    radius,
    fallback,
}) => {
    const { theme } = useTheme()
    const [showFallback, setShowFallback] = useState(false)

    const iconUrl = federation?.meta
        ? getFederationIconUrl(federation?.meta)
        : null

    // without this, one failed load keeps the fallback for every later url
    useEffect(() => setShowFallback(false), [iconUrl])

    const svgSize = typeof size !== 'number' ? size : undefined
    const svgProps =
        typeof size === 'number' ? { width: size, height: size } : undefined
    const pxSize = typeof size === 'number' ? size : theme.sizes[size]

    // stable identity: `RemoteIcon` refetches an svg when `onError` changes
    const handleError = useCallback(() => setShowFallback(true), [])

    const style = styles(theme)

    const shapeStyle =
        shape === 'circle'
            ? style.shapeCircle
            : {
                  ...style.shapeSquare,
                  ...(radius !== undefined && { borderRadius: radius }),
              }

    if (!iconUrl || showFallback) {
        return (
            <View testID="FederationLogo__Fallback">
                {fallback ?? (
                    <SvgImage
                        name="Federation"
                        size={svgSize}
                        svgProps={{ ...shapeStyle, ...svgProps }}
                    />
                )}
            </View>
        )
    }

    return (
        <View testID="FederationLogo__Avatar">
            <View
                style={[
                    svgProps,
                    style.fallbackIconContainer,
                    shape === 'hex' ? { backgroundColor: 'transparent' } : {},
                ]}>
                {shape === 'square' && (
                    <Image
                        style={[style.fallbackIconLayer, shapeStyle]}
                        source={Images.FallbackInset}
                    />
                )}
                <Column center style={style.fallbackIconLayer}>
                    <ActivityIndicator size={16} color={theme.colors.primary} />
                </Column>
                {shape === 'hex' ? (
                    <HexImage imageUrl={iconUrl} />
                ) : (
                    <RemoteIcon
                        url={iconUrl}
                        size={pxSize}
                        style={[style.iconImage, svgProps, shapeStyle]}
                        cache="force-cache"
                        onError={handleError}
                        testID="FederationLogo__Image"
                    />
                )}
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        fallbackIconContainer: {
            borderRadius: 8,
            overflow: 'hidden',
            position: 'relative',
        },
        fallbackIconLayer: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
        },
        iconImage: {
            backgroundColor: theme.colors.white,
        },
        shapeSquare: {
            borderRadius: 8,
            overflow: 'hidden',
        },
        shapeCircle: {
            borderRadius: 1024,
            overflow: 'hidden',
        },
    })
