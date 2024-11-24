import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native'

import { LoadedFederationListItem } from '@fedi/common/types'
import { getFederationIconUrl } from '@fedi/common/utils/FederationUtils'

import { Images } from '../../../assets/images'
import HexImage from '../../ui/HexImage'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type Props = {
    federation?: Pick<LoadedFederationListItem, 'id' | 'name' | 'meta'>
    size: SvgImageSize | number
    hex?: boolean
}

export const FederationLogo: React.FC<Props> = ({
    federation,
    size,
    hex = false,
}) => {
    const { theme } = useTheme()

    const iconUrl = federation?.meta
        ? getFederationIconUrl(federation?.meta)
        : null
    const svgSize = typeof size !== 'number' ? size : undefined
    const svgProps =
        typeof size === 'number' ? { width: size, height: size } : undefined

    const style = styles(theme)

    if (!iconUrl) {
        return (
            <View>
                <SvgImage
                    name="Federation"
                    size={svgSize}
                    svgProps={{ ...style.svgIconImage, ...svgProps }}
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
                    hex ? { backgroundColor: 'transparent' } : {},
                ]}>
                {!hex && (
                    <Image
                        style={style.fallbackIconLayer}
                        source={Images.FallbackInset}
                    />
                )}
                <View style={style.fallbackIconLayer}>
                    <ActivityIndicator size={16} color={theme.colors.primary} />
                </View>
                {hex ? (
                    <HexImage imageUrl={iconUrl} />
                ) : (
                    <Image
                        style={[style.iconImage, svgProps]}
                        source={{ uri: iconUrl }}
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
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        },
        iconImage: {
            borderRadius: 8,
            backgroundColor: theme.colors.white,
        },
        svgIconImage: {
            borderRadius: 8,
        },
    })
