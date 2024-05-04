import { Text } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

/*
    UI Component: LineBreak

    Easily create empty space in the UI

    Useful as an alternative to a <View> wrapper and/or adding
    margins/padding to a new or existing style

    specify the number of newlines to render with

    <LineBreak count={3} />
*/

type LineBreakProps = {
    count?: number
}

const LineBreak: React.FC<LineBreakProps> = ({ count = 1 }: LineBreakProps) => {
    return (
        <>
            {new Array(count).fill(0).map((_, i) => (
                <Text key={`lb-${i}`} style={styles.default}>
                    {'\n'}
                </Text>
            ))}
        </>
    )
}

// Be careful if changing these value since there is some inconsistent
// behavior on smaller screens, be sure to test on a few screen sizes
const styles = StyleSheet.create({
    default: { lineHeight: 8, fontSize: 8 },
})

export default LineBreak
