import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { Column } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

export type Props = {
    onPressFees: () => void
    onSend?: () => void
    formattedTotalFee: string
    senderText: string | React.ReactNode
    sendButtonText?: string
    receiverText?: string | React.ReactNode
    showTotalFee?: boolean
    formattedAmount?: string
    formattedTotalAmount?: string
    isLoading?: boolean
    notesText?: string
}

const DetailItem = ({
    title,
    value,
    onPress,
    thin = false,
    bottomBorder = false,
    bold = false,
}: {
    title: string
    value: string | React.ReactNode
    onPress?: () => void
    bottomBorder?: boolean
    bold?: boolean
    thin?: boolean
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    const Wrapper = onPress ? Pressable : View
    return (
        <Wrapper
            style={[
                thin ? style.detailBlockRow : style.detailItem,
                bottomBorder && style.bottomBorder,
            ]}
            onPress={onPress}>
            <Text
                caption
                bold={bold}
                color={theme.colors.primary}
                style={style.detailItemTitle}>
                {title}
            </Text>
            {typeof value === 'string' ? (
                <Text caption bold={bold} color={theme.colors.primary}>
                    {value}
                </Text>
            ) : (
                value
            )}
        </Wrapper>
    )
}

const SendPreviewDetails: React.FC<Props> = ({
    onPressFees,
    onSend,
    formattedTotalFee,
    receiverText,
    senderText,
    sendButtonText,
    formattedAmount,
    formattedTotalAmount,
    showTotalFee = false,
    isLoading = false,
    notesText,
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
                    <DetailItem
                        title={t('feature.send.send-to')}
                        value={receiverText}
                        bottomBorder={true}
                        bold
                    />
                )}
                {showTotalFee ? (
                    <View style={[style.detailBlock, style.bottomBorder]}>
                        <DetailItem
                            title={t('words.amount')}
                            value={formattedAmount ?? ''}
                            thin
                        />
                        <DetailItem
                            title={t('words.fees')}
                            value={
                                <>
                                    <Text
                                        caption
                                        color={
                                            theme.colors.primary
                                        }>{`${formattedTotalFee}`}</Text>
                                    <SvgImage
                                        name="Info"
                                        size={16}
                                        color={theme.colors.primary}
                                        containerStyle={style.infoIcon}
                                    />
                                </>
                            }
                            thin
                            onPress={onPressFees}
                        />
                        <DetailItem
                            title={t('words.total')}
                            value={formattedTotalAmount ?? ''}
                            thin
                            bold
                        />
                    </View>
                ) : (
                    <DetailItem
                        title={t('words.fees')}
                        value={
                            <>
                                <Text caption color={theme.colors.primary}>
                                    {formattedTotalFee}
                                </Text>
                                <SvgImage
                                    name="Info"
                                    size={16}
                                    color={theme.colors.primary}
                                    containerStyle={style.infoIcon}
                                />
                            </>
                        }
                        bottomBorder={true}
                        onPress={onPressFees}
                    />
                )}
                <DetailItem
                    title={t('feature.send.send-from')}
                    value={senderText}
                    bold
                />
                {notesText && (
                    <View style={style.notesContainer}>
                        <Column
                            align="stretch"
                            justify="center"
                            fullWidth
                            gap="sm"
                            style={style.notesContent}>
                            <Text small medium color={theme.colors.night}>
                                {t('words.notes')}
                            </Text>
                            <Text small color={theme.colors.grey}>
                                {notesText}
                            </Text>
                        </Column>
                    </View>
                )}
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
                            : t('phrases.show-details')}
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
            marginTop: theme.spacing.sm,
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
        detailBlockRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        detailBlock: {
            flexDirection: 'column',
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.md,
        },
        detailItemTitle: {
            marginRight: 'auto',
        },
        detailsButton: {
            backgroundColor: theme.colors.grey100,
            width: '100%',
        },
        infoIcon: {
            marginLeft: theme.spacing.xs,
        },
        notesContainer: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            marginTop: theme.spacing.sm,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.lightGrey,
            alignSelf: 'stretch',
        },
        notesContent: {
            paddingHorizontal: theme.spacing.xs,
        },
    })

export default SendPreviewDetails
