import React, { useEffect, useMemo } from 'react'
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { SvgUri } from 'react-native-svg'

const SVG_PATH = /\.svg([?#]|$)/i

/** React Native's `Image` decodes no svg, so an svg url is drawn by `SvgUri`. */
export const RemoteIcon: React.FC<{
    url: string
    size: number
    style?: StyleProp<ViewStyle>
    cache?: 'force-cache'
    /** Must keep its identity: `SvgUri` refetches whenever `onError` changes. */
    onError: () => void
    testID?: string
}> = ({ url, size, style, cache, onError, testID }) => {
    // `SvgUri` renders `fallback` on a parse failure without calling `onError`
    const reportParseFailure = useMemo(
        () => <ReportSvgParseFailure onError={onError} />,
        [onError],
    )

    return (
        <View style={style}>
            {SVG_PATH.test(url) ? (
                <SvgUri
                    uri={url}
                    width={size}
                    height={size}
                    onError={onError}
                    fallback={reportParseFailure}
                    testID={testID && `${testID}-svg`}
                />
            ) : (
                <Image
                    style={StyleSheet.absoluteFill}
                    source={{ uri: url, cache }}
                    resizeMode="cover"
                    onError={onError}
                    testID={testID}
                />
            )}
        </View>
    )
}

const ReportSvgParseFailure: React.FC<{ onError: () => void }> = ({
    onError,
}) => {
    useEffect(() => onError(), [onError])
    return null
}
