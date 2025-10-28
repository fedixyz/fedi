import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { NavigationHook } from '../../../types/navigation'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'
import GradientView from '../../ui/GradientView'
import Header from '../../ui/Header'
import MainHeaderButtons from '../../ui/MainHeaderButtons'
import TotalBalance from '../../ui/TotalBalance'
import HeaderOverlayOption from '../chat/HeaderOverlayOption'

const ModsHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    const [optionsOverlayOpen, setOptionsOverlayOpen] = useState(false)

    const style = styles(theme)

    const handleAddMiniApp = () => {
        setOptionsOverlayOpen(false)
        navigation.navigate('AddFediMod')
    }

    const handleGoToMiniAppCatalog = () => {
        setOptionsOverlayOpen(false)
        navigation.navigate('FediModBrowser', {
            url: 'https://fedi-catalog.vercel.app',
        })
    }

    return (
        <>
            <GradientView variant="sky" style={style.container}>
                <Header
                    transparent
                    containerStyle={style.headerContainer}
                    headerLeft={
                        <Text h2 medium numberOfLines={1} adjustsFontSizeToFit>
                            {t('phrases.mini-apps')}
                        </Text>
                    }
                    headerRight={
                        <MainHeaderButtons
                            onAddPress={() => setOptionsOverlayOpen(true)}
                        />
                    }
                />
                <TotalBalance />
            </GradientView>
            <CustomOverlay
                show={optionsOverlayOpen}
                onBackdropPress={() => setOptionsOverlayOpen(false)}
                contents={{
                    body: (
                        <Column gap="lg">
                            <HeaderOverlayOption
                                onPress={handleAddMiniApp}
                                text={t('feature.fedimods.add-a-mini-app')}
                                icon="Apps"
                            />
                            <HeaderOverlayOption
                                onPress={handleGoToMiniAppCatalog}
                                text={t(
                                    'feature.fedimods.go-to-mini-app-catalog',
                                )}
                                icon="ListSearch"
                            />
                        </Column>
                    ),
                }}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingHorizontal: theme.spacing.lg,
            display: 'flex',
            gap: theme.spacing.xs,
            paddingBottom: theme.spacing.md,
        },
        headerContainer: {
            paddingHorizontal: 0,
        },
    })

export default ModsHeader
