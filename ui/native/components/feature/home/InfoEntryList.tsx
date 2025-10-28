import { Theme } from '@rneui/themed'
import React, { memo, useCallback } from 'react'
import { FlatList, ListRenderItem, View, StyleSheet } from 'react-native'

import { FirstTimeOverlayItem } from '../onboarding/FirstTimeOverlay'
import InfoEntryListItem from './InfoEntryListItem'

export type InfoEntryListProps = {
    items: FirstTimeOverlayItem[]
    theme: Theme
}
const ItemSeparator = () => <View style={styles.separator} />

const InfoEntryList: React.FC<InfoEntryListProps> = memo(({ items, theme }) => {
    const renderItem: ListRenderItem<FirstTimeOverlayItem> = useCallback(
        ({ item }) => <InfoEntryListItem item={item} theme={theme} />,
        [theme],
    )

    return (
        <FlatList
            data={items}
            keyExtractor={(_, index) => `item-${index}`}
            renderItem={renderItem}
            ItemSeparatorComponent={ItemSeparator}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
        />
    )
})

const styles = StyleSheet.create({
    separator: {
        height: 16,
    },
})

export default InfoEntryList
