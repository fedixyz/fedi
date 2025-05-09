import { Button, Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View, StyleSheet } from 'react-native'

import CustomOverlay from '../../ui/CustomOverlay'
import { SvgImageName } from '../../ui/SvgImage'
import InfoEntryList from '../home/InfoEntryList'

export type FirstTimeCommunityEntryItem = {
    icon: SvgImageName
    text: string
}

type FirstTimeCommunityEntryOverlayProps = {
    show: boolean
    onDismiss: () => void
    /** Items to display in the overlay */
    overlayItems: FirstTimeCommunityEntryItem[]
    /** Title text for the overlay header */
    title: string
}

const FirstTimeCommunityEntryOverlay: React.FC<
    FirstTimeCommunityEntryOverlayProps
> = ({ show, onDismiss, overlayItems, title }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={onDismiss}
            contents={{
                body: (
                    <View style={styles.contentWrapper}>
                        <Text style={styles.title}>{title}</Text>
                        <InfoEntryList items={overlayItems} theme={theme} />
                        <Button
                            title={t('phrases.explore-now')}
                            onPress={onDismiss}
                            containerStyle={styles.exploreButton}
                        />
                    </View>
                ),
            }}
        />
    )
}

const styles = StyleSheet.create({
    contentWrapper: {
        width: '100%',
        gap: 16,
        paddingTop: 12,
        paddingBottom: 12,
        paddingLeft: 16,
        paddingRight: 16,
    },
    title: {
        marginBottom: 16,
        fontWeight: '600',
        fontSize: 20,
        textAlign: 'left',
    },
    exploreButton: {
        marginTop: 24,
    },
})

export default FirstTimeCommunityEntryOverlay
