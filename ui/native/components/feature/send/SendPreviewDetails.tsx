import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import SvgImage from '../../ui/SvgImage'

export type Props = {
    onPressFees: () => void
    onSend?: () => void
    formattedTotalFee: string
    senderText: string | React.ReactNode
    sendButtonText?: string
    receiverText?: string | React.ReactNode
    isLoading?: boolean
}

const SendPreviewDetails: React.FC<Props> = ({
    onPressFees,
    onSend,
    formattedTotalFee,
    receiverText,
    senderText,
    sendButtonText,
    isLoading = false,
}) => {
    const { theme } = useTheme()
    const [showDetails, setShowDetails] = useState<boolean>(false)
    const { t } = useTranslation()

    const style = styles(theme)
    return (
        <View style={style.detailsGroup}>
            <View
                style={[
                    showDetails
                        ? style.detailsContainer
                        : style.collapsedContainer,
                ]}>
                {receiverText && (
                    <View style={[style.detailItem, style.bottomBorder]}>
                        <Text caption bold style={style.darkGrey}>{`${t(
                            'feature.send.send-to',
                        )}`}</Text>
                        {typeof receiverText === 'string' ? (
                            <Text caption style={style.darkGrey}>
                                {receiverText}
                            </Text>
                        ) : (
                            receiverText
                        )}
                    </View>
                )}
                <Pressable
                    style={[style.detailItem, style.bottomBorder]}
                    onPress={onPressFees}>
                    <Text
                        caption
                        bold
                        style={[style.darkGrey, style.detailItemTitle]}>{`${t(
                        'words.fees',
                    )}`}</Text>
                    <Text
                        caption
                        style={style.darkGrey}>{`${formattedTotalFee}`}</Text>
                    <SvgImage name="Info" size={16} color={theme.colors.grey} />
                </Pressable>
                <View style={[style.detailItem]}>
                    <Text caption bold style={style.darkGrey}>{`${t(
                        'feature.send.send-from',
                    )}`}</Text>
                    {typeof senderText === 'string' ? (
                        <Text caption style={style.darkGrey}>
                            {senderText}
                        </Text>
                    ) : (
                        senderText
                    )}
                </View>
            </View>
            <Button
                fullWidth
                containerStyle={[style.button]}
                buttonStyle={[style.detailsButton]}
                onPress={() => setShowDetails(!showDetails)}
                title={
                    <Text medium>
                        {showDetails
                            ? t('phrases.hide-details')
                            : t('feature.stabilitypool.details-and-fee')}
                    </Text>
                }
            />
            {typeof onSend === 'function' && (
                <Button
                    fullWidth
                    containerStyle={[style.button]}
                    onPress={onSend}
                    disabled={isLoading}
                    loading={isLoading}
                    title={
                        <Text medium style={style.buttonText}>
                            {sendButtonText ?? t('words.send')}
                        </Text>
                    }
                />
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bottomBorder: {
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.extraLightGrey,
        },
        detailsGroup: {
            width: '100%',
            marginTop: 'auto',
        },
        button: {
            marginTop: theme.spacing.lg,
        },
        buttonText: {
            color: theme.colors.secondary,
        },
        collapsedContainer: {
            height: 0,
            opacity: 0,
        },
        detailsContainer: {
            width: '100%',
            opacity: 1,
        },
        detailItem: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 52,
        },
        detailItemTitle: {
            marginRight: 'auto',
        },
        darkGrey: {
            color: theme.colors.darkGrey,
        },
        detailsButton: {
            backgroundColor: theme.colors.offWhite,
            width: '100%',
        },
    })

export default SendPreviewDetails
