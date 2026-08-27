import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { Eyebrow } from '../../ui/Eyebrow'
import { Column, Row } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'

/**
 * The wallet icon as the federation publishes it: a remote image, falling back
 * to the initial when there is no url or the image cannot be fetched. The url
 * is only ever validated for shape, never fetched, before it is saved — so a
 * url that 404s or serves a web page rather than an image must degrade to the
 * letter rather than leaving an empty square.
 */
export const ServiceIconThumbnail: React.FC<{
    url: string | null
    /** Shown when there is no image to draw. */
    fallback: string
}> = ({ url, fallback }) => {
    const { theme } = useTheme()
    const [hasFailed, setHasFailed] = useState(false)

    // a different url deserves a fresh attempt: without this, one broken image
    // would keep the fallback showing for every url the operator tries next
    useEffect(() => setHasFailed(false), [url])

    const style = styles(theme)

    if (!url || hasFailed)
        return <Text style={style.thumbnailText}>{fallback}</Text>

    return (
        <Image
            style={style.thumbnailImage}
            source={{ uri: url }}
            resizeMode="cover"
            onError={() => setHasFailed(true)}
            testID="settings-icon-thumbnail"
        />
    )
}

/** Grouped rows under an uppercase section label. */
export const ServiceSettingsSection: React.FC<{
    title: string
    children: React.ReactNode
}> = ({ title, children }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Column gap="sm" fullWidth>
            <Eyebrow>{title}</Eyebrow>
            <Column style={style.card}>{children}</Column>
        </Column>
    )
}

export const ServiceSettingsDivider: React.FC = () => {
    const { theme } = useTheme()
    return <View style={styles(theme).divider} />
}

/**
 * A labelled value the operator edits in place, e.g. the wallet name.
 * Matches the prototype's `.info-row`.
 */
export const ServiceInfoRow: React.FC<{
    label: string
    value?: string | null
    /**
     * Square thumbnail shown alongside the value, e.g. the wallet icon. A
     * string is drawn as an initial; a node is drawn as-is.
     */
    thumbnail?: string | React.ReactNode
    /**
     * How an over-long value is shortened, on one line. Omit to let the value
     * wrap, which is what prose wants. `middle` suits a url, where the host and
     * the filename both carry meaning but the path between them does not.
     */
    valueEllipsizeMode?: 'tail' | 'middle'
    onEdit: () => void
    disabled?: boolean
    testID?: string
}> = ({
    label,
    value,
    thumbnail,
    valueEllipsizeMode,
    onEdit,
    disabled,
    testID,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Row align="center" gap={14} style={style.infoRow}>
            {thumbnail !== undefined && (
                <Row center style={style.thumbnail}>
                    {typeof thumbnail === 'string' ? (
                        <Text style={style.thumbnailText}>{thumbnail}</Text>
                    ) : (
                        thumbnail
                    )}
                </Row>
            )}
            <Column grow shrink>
                <Eyebrow style={style.infoLabel}>{label}</Eyebrow>
                {value ? (
                    <Text
                        style={style.infoValue}
                        numberOfLines={valueEllipsizeMode ? 1 : undefined}
                        ellipsizeMode={valueEllipsizeMode}>
                        {value}
                    </Text>
                ) : null}
            </Column>
            <Pressable
                testID={testID}
                disabled={disabled}
                containerStyle={style.pencil}
                onPress={disabled ? undefined : onEdit}>
                <SvgImage name="Edit" size={14} color={theme.colors.darkGrey} />
            </Pressable>
        </Row>
    )
}

/**
 * A row that opens something else — a sheet or another screen.
 * Matches the prototype's `.settings-row.action`.
 */
export const ServiceActionRow: React.FC<{
    icon: SvgImageName
    name: string
    detail?: string | null
    onPress: () => void
    disabled?: boolean
    /** Rendered after the name, e.g. a help affordance. */
    trailing?: React.ReactNode
    testID?: string
}> = ({ icon, name, detail, onPress, disabled, trailing, testID }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Pressable
            testID={testID}
            disabled={disabled}
            containerStyle={style.actionRow}
            onPress={disabled ? undefined : onPress}>
            <Row align="center" gap={14} grow>
                <Row center style={style.actionIcon}>
                    <SvgImage
                        name={icon}
                        size={17}
                        color={theme.colors.primary}
                    />
                </Row>
                <Column gap={2} grow shrink>
                    <Row align="center" gap="xs">
                        <Text style={style.actionName}>{name}</Text>
                        {trailing}
                    </Row>
                    {detail ? (
                        <Text style={style.actionDetail}>{detail}</Text>
                    ) : null}
                </Column>
                <SvgImage
                    name="ChevronRight"
                    size={16}
                    color={theme.colors.grey}
                />
            </Row>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.colors.white,
            borderColor: theme.colors.dividerGrey,
            borderRadius: 14,
            borderWidth: 1,
            // keeps the pressed row highlight inside the card corners
            overflow: 'hidden',
        },
        divider: {
            backgroundColor: theme.colors.dividerGrey,
            height: 1,
        },
        infoRow: {
            paddingHorizontal: 14,
            paddingVertical: 14,
        },
        infoLabel: {
            marginBottom: 3,
        },
        infoValue: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '500',
            lineHeight: 18,
        },
        thumbnail: {
            backgroundColor: theme.colors.grey100,
            borderRadius: 10,
            height: 42,
            width: 42,
            // keeps a remote icon inside the rounded square
            overflow: 'hidden',
        },
        thumbnailImage: {
            height: '100%',
            width: '100%',
        },
        thumbnailText: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.body,
            fontWeight: '700',
        },
        pencil: {
            alignItems: 'center',
            borderRadius: 10,
            height: 34,
            justifyContent: 'center',
            // axis-specific: Pressable's base sets paddingVertical/Horizontal
            // and those beat the `padding` shorthand
            paddingHorizontal: 0,
            paddingVertical: 0,
            width: 34,
        },
        actionRow: {
            paddingHorizontal: 14,
            paddingVertical: 15,
            width: '100%',
        },
        actionIcon: {
            height: 22,
            width: 22,
        },
        actionName: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '600',
        },
        actionDetail: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 17,
        },
    })
