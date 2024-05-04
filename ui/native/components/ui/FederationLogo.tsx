import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native'

import { Federation } from '@fedi/common/types'
import { getFederationIconUrl } from '@fedi/common/utils/FederationUtils'

import { Images } from '../../assets/images'
import SvgImage, { SvgImageSize } from './SvgImage'

type Props = {
    federation?: Pick<Federation, 'id' | 'name' | 'meta'>
    size: SvgImageSize | number
}

export const FederationLogo: React.FC<Props> = ({ federation, size }) => {
    const [loaded, setLoaded] = React.useState(false)
    const [hasErrored, setHasErrored] = React.useState(false)

    const { theme } = useTheme()

    const iconUrl = federation?.meta
        ? getFederationIconUrl(federation?.meta)
        : null
    const svgSize = typeof size !== 'number' ? size : undefined
    const svgProps =
        typeof size === 'number' ? { width: size, height: size } : undefined

    const style = styles(theme)

    return iconUrl ? (
        <>
            <Image
                style={[
                    style.iconImage,
                    svgProps,
                    !loaded ? style.loadingState : {},
                ]}
                source={{ uri: iconUrl }}
                resizeMode="cover"
                onError={() => setHasErrored(true)}
                onLoadEnd={() => setLoaded(true)}
            />

            {(!loaded || hasErrored) && (
                <View style={[svgProps, style.fallbackIconContainer]}>
                    <Image
                        style={style.fallbackIconLayer}
                        source={Images.FallbackInset}
                    />
                    <View style={style.fallbackIconLayer}>
                        <ActivityIndicator
                            size={16}
                            color={theme.colors.primary}
                        />
                    </View>
                </View>
            )}
        </>
    ) : (
        <SvgImage
            name="Federation"
            size={svgSize}
            svgProps={{ ...style.svgIconImage, ...svgProps }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        fallbackIconContainer: {
            borderRadius: 8,
            backgroundColor: theme.colors.white,
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
        },
        svgIconImage: {
            borderRadius: 8,
        },
        loadingState: {
            opacity: 0,
            width: 1,
            height: 1,
        },
    })
