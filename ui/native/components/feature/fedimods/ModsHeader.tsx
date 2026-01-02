import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { CATALOG_URL } from '@fedi/common/constants/fedimods'
import { openMiniAppSession } from '@fedi/common/redux'

import { useAppDispatch } from '../../../state/hooks'
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
    const dispatch = useAppDispatch()
    const navigation = useNavigation<NavigationHook>()

    const [optionsOverlayOpen, setOptionsOverlayOpen] = useState(false)

    const style = styles(theme)

    const handleAddMiniApp = () => {
        setOptionsOverlayOpen(false)
        navigation.navigate('AddFediMod', { inputMethod: 'enter' })
    }

    const handleGoToMiniAppCatalog = () => {
        setOptionsOverlayOpen(false)
        dispatch(
            openMiniAppSession({ miniAppId: CATALOG_URL, url: CATALOG_URL }),
        )
        navigation.navigate('FediModBrowser')
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
                        <Column>
                            <HeaderOverlayOption
                                onPress={handleGoToMiniAppCatalog}
                                text={t('feature.fedimods.add-from-catalog')}
                                icon="Apps"
                            />
                            <HeaderOverlayOption
                                onPress={handleAddMiniApp}
                                text={t('feature.fedimods.enter-site-link')}
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
