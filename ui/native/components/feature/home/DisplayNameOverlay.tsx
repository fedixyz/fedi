import { useTheme, Button, Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View, StyleSheet } from 'react-native'

import { selectMatrixAuth } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import CenterOverlay from '../../ui/CenterOverlay'
import { Row, Column } from '../../ui/Flex'
import HoloCircle from '../../ui/HoloCircle'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type DisplayNameOverlayProps = {
    show?: boolean
    onDismiss: () => void
}

const DisplayNameOverlay: React.FC<DisplayNameOverlayProps> = ({
    show = false,
    onDismiss,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    return (
        <CenterOverlay show={show} onBackdropPress={onDismiss}>
            <Column align="center">
                <HoloCircle
                    content={<SvgImage name="Profile" size={SvgImageSize.lg} />}
                    size={64}
                />

                <Text h2 medium style={styles.title}>
                    {t('feature.home.display-name')}
                </Text>

                <Text h2 medium style={styles.displayName}>
                    “{matrixAuth?.displayName || t('phrases.not-set')}“
                </Text>

                <Row center wrap style={styles.instructionRow}>
                    <Text
                        style={[
                            styles.instructionText,
                            { color: theme.colors.darkGrey },
                        ]}>
                        {t('feature.home.profile-change')}{' '}
                    </Text>

                    <View style={styles.inlineIconWrapper}>
                        <SvgImage name="Profile" size={20} />
                    </View>

                    <Text
                        style={[
                            styles.instructionText,
                            { color: theme.colors.darkGrey },
                        ]}>
                        {' menu.'}
                    </Text>
                </Row>
            </Column>
            <Button fullWidth title="Continue" onPress={onDismiss} />
        </CenterOverlay>
    )
}

const styles = StyleSheet.create({
    title: {
        fontSize: 20,
        marginBottom: 8,
        marginTop: 8,
        textAlign: 'center',
    },
    displayName: {
        fontSize: 20,
        fontWeight: 'bold',
        top: -6,
        marginBottom: 0,
        textAlign: 'center',
    },
    instructionRow: {
        marginTop: 8,
        marginBottom: 18,
    },
    inlineIconWrapper: {
        marginHorizontal: 2,
        marginBottom: -2,
    },
    instructionText: {
        fontSize: 16,
        lineHeight: 18,
        textAlign: 'center',
    },
})

export default DisplayNameOverlay
