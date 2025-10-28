import { Button, Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import { SvgImageName } from '../../ui/SvgImage'
import InfoEntryList from '../home/InfoEntryList'

export type FirstTimeOverlayItem = {
    icon: SvgImageName
    text: string
}

type FirstTimeOverlayProps = {
    show: boolean
    onDismiss: () => void
    /** Items to display in the overlay */
    overlayItems: FirstTimeOverlayItem[]
    /** Title text for the overlay header */
    title: string
    buttonLabel?: string
}

const FirstTimeOverlay: React.FC<FirstTimeOverlayProps> = ({
    show,
    onDismiss,
    overlayItems,
    title,
    buttonLabel,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={onDismiss}
            contents={{
                body: (
                    <Flex gap="lg" fullWidth style={styles.contentWrapper}>
                        <Text style={styles.title}>{title}</Text>
                        <InfoEntryList items={overlayItems} theme={theme} />
                        <Button
                            title={buttonLabel || t('phrases.explore-now')}
                            onPress={onDismiss}
                            containerStyle={styles.exploreButton}
                        />
                    </Flex>
                ),
            }}
        />
    )
}

const styles = StyleSheet.create({
    contentWrapper: {
        paddingVertical: 12,
        paddingHorizontal: 16,
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

export default FirstTimeOverlay
