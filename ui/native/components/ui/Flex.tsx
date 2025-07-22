import { ThemeSpacing, useTheme } from '@rneui/themed'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { ViewProps } from 'react-native-svg/lib/typescript/fabric/utils'

type Props = {
    /* Determines whether the flex is a row or column. Defaults to `false` (column) */
    row?: boolean
    /* Column-reverse shorthand */
    columnReverse?: boolean
    /* Shorthand for alignItems: center + justifyContent: center */
    center?: boolean
    /* alignItems */
    align?: 'start' | 'center' | 'end' | 'stretch'
    /* justifyContent */
    justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
    /* Flex gap */
    gap?: keyof ThemeSpacing | number
    /* Flex basis (set to `false` for flex-basis: 0) */
    basis?: boolean
    grow?: boolean
    shrink?: boolean
    /* Full width shorthand */
    fullWidth?: boolean
    /* Flex wrap */
    wrap?: boolean
}

const Flex: React.FC<Props & ViewProps> = ({
    row,
    center,
    align,
    justify,
    gap,
    grow,
    shrink,
    basis,
    style,
    wrap,
    fullWidth,
    columnReverse,
    ...props
}) => {
    const { theme } = useTheme()

    let styleProp: StyleProp<ViewStyle> = [flexStyle.flex]

    // Direction
    let direction: StyleProp<ViewStyle> = flexStyle.col
    if (row) direction = flexStyle.row
    if (columnReverse) direction = flexStyle.columnReverse
    styleProp.push(direction)

    // Align / Justify
    if (center) styleProp.push(alignStyle.center, justifyStyle.center)
    if (align) styleProp.push(alignStyle[align])
    if (justify) styleProp.push(justifyStyle[justify])

    // Gap
    if (gap) {
        if (typeof gap === 'number') {
            styleProp.push({ gap })
        } else {
            styleProp.push({ gap: theme.spacing[gap] })
        }
    }

    // Grow / Shrink / Basis
    if (grow) styleProp.push(flexStyle.grow)
    if (grow === false) styleProp.push(flexStyle.noGrow)
    if (shrink) styleProp.push(flexStyle.shrink)
    if (shrink === false) styleProp.push(flexStyle.noShrink)
    if (basis === false) styleProp.push(flexStyle.noBasis)

    // Full width
    if (fullWidth) styleProp.push(flexStyle.fullWidth)

    // Flex Wrap
    if (wrap) styleProp.push(flexStyle.wrap)

    // Other view styles
    if (style) styleProp = styleProp.concat(style)

    return <View style={styleProp} {...props} />
}

const flexStyle = StyleSheet.create({
    flex: { display: 'flex' },
    row: { flexDirection: 'row' },
    col: { flexDirection: 'column' },
    columnReverse: { flexDirection: 'column-reverse' },
    grow: { flexGrow: 1 },
    noGrow: { flexGrow: 0 },
    shrink: { flexShrink: 1 },
    noShrink: { flexShrink: 0 },
    noBasis: { flexBasis: 0 },
    fullWidth: { width: '100%' },
    wrap: { flexWrap: 'wrap' },
})

const alignStyle = StyleSheet.create({
    start: { alignItems: 'flex-start' },
    center: { alignItems: 'center' },
    end: { alignItems: 'flex-end' },
    stretch: { alignItems: 'stretch' },
})

const justifyStyle = StyleSheet.create({
    start: { justifyContent: 'flex-start' },
    center: { justifyContent: 'center' },
    end: { justifyContent: 'flex-end' },
    between: { justifyContent: 'space-between' },
    around: { justifyContent: 'space-around' },
    evenly: { justifyContent: 'space-evenly' },
})

export default Flex
