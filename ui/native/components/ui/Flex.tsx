import { ThemeSpacing, useTheme } from '@rneui/themed'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { ViewProps } from 'react-native-svg/lib/typescript/fabric/utils'

type Props = {
    /* Determines whether the flex is a row or column. Defaults to `false` (column) */
    row?: boolean
    /* alignItems */
    align?: 'start' | 'center' | 'end' | 'stretch'
    /* justifyContent */
    justify?: 'start' | 'center' | 'end' | 'between'
    /* Flex gap */
    gap?: keyof ThemeSpacing
    /* Flex basis (set to `false` for flex-basis: 0) */
    basis?: boolean
    grow?: boolean
    shrink?: boolean
}

const Flex: React.FC<Props & ViewProps> = ({
    row,
    align,
    justify,
    gap,
    grow,
    shrink,
    basis,
    ...props
}) => {
    const { theme } = useTheme()

    const styleProp: StyleProp<ViewStyle> = [flexStyle.flex]

    // Direction
    styleProp.push(row ? flexStyle.row : flexStyle.col)

    // Align / Justify
    if (align) styleProp.push(alignStyle[align])
    if (justify) styleProp.push(justifyStyle[justify])

    // Gap
    if (gap) styleProp.push({ gap: theme.spacing[gap] })

    // Grow / Shrink / Basis
    if (grow) styleProp.push(flexStyle.grow)
    if (grow === false) styleProp.push(flexStyle.noGrow)
    if (shrink) styleProp.push(flexStyle.shrink)
    if (shrink === false) styleProp.push(flexStyle.noShrink)
    if (basis === false) styleProp.push(flexStyle.noBasis)

    return <View style={styleProp} {...props} />
}

const flexStyle = StyleSheet.create({
    flex: { display: 'flex' },
    row: { flexDirection: 'row' },
    col: { flexDirection: 'column' },
    grow: { flexGrow: 1 },
    noGrow: { flexGrow: 0 },
    shrink: { flexShrink: 1 },
    noShrink: { flexShrink: 0 },
    noBasis: { flexBasis: 0 },
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
})

export default Flex
