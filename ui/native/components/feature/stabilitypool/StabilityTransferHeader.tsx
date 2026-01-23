import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { NavigationHook } from '../../../types/navigation'
import { Row } from '../../ui/Flex'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'
import { StabilityInfoIcon } from './StabilityInfoIcon'

const StabilityTransferHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const { theme } = useTheme()
    const style = styles(theme)
    const openOmniScanner = useCallback(() => {
        return navigation.navigate('OmniScanner')
    }, [navigation])

    return (
        <>
            <Header
                backButton
                headerCenter={
                    <Text bold numberOfLines={1} adjustsFontSizeToFit>
                        {t('feature.stabilitypool.transfer-money')}
                    </Text>
                }
                headerRight={
                    <Row gap="md">
                        <StabilityInfoIcon />
                        <PressableIcon
                            testID="ScanButton"
                            containerStyle={style.icon}
                            onPress={openOmniScanner}
                            hitSlop={5}
                            svgName="Scan"
                        />
                    </Row>
                }
            />
        </>
    )
}
const styles = (theme: Theme) =>
    StyleSheet.create({
        icon: {
            alignItems: 'center',
            display: 'flex',
            height: theme.sizes.md,
            justifyContent: 'center',
            width: theme.sizes.md,
        },
    })

export default StabilityTransferHeader
