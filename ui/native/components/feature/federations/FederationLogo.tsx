import { Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native'

import { LoadedFederation } from '@fedi/common/types'
import { getFederationIconUrl } from '@fedi/common/utils/FederationUtils'

import { Images } from '../../../assets/images'
import { Column } from '../../ui/Flex'
import HexImage from '../../ui/HexImage'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type Props = {
    federation?: Pick<LoadedFederation, 'id' | 'meta'>
    size: SvgImageSize | number
    shape?: 'square' | 'hex' | 'circle'
}

export const FederationLogo: React.FC<Props> = ({
    federation,
    size,
    shape = 'square',
}) => {
    const { theme } = useTheme()
    const [showFallback, setShowFallback] = useState(false)

    const iconUrl = federation?.meta
        ? getFederationIconUrl(federation?.meta)
        : null
    const svgSize = typeof size !== 'number' ? size : undefined
    const svgProps =
        typeof size === 'number' ? { width: size, height: size } : undefined

    const style = styles(theme)

    const shapeStyle =
        shape === 'circle' ? style.shapeCircle : style.shapeSquare

    if (!iconUrl || showFallback) {
        return (
            <View>
                <SvgImage
                    name="Federation"
                    size={svgSize}
                    svgProps={{ ...shapeStyle, ...svgProps }}
                />
            </View>
        )
    }

    return (
        <View>
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
                    <Image
                        style={[style.iconImage, svgProps, shapeStyle]}
                        source={{ uri: iconUrl, cache: 'force-cache' }}
                        onError={() => {
                            setShowFallback(true)
                        }}
                        resizeMode="cover"
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
