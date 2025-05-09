import { Text, Theme, useTheme } from '@rneui/themed'
import { ResourceKey } from 'i18next'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

const CheckList: React.FC<{ items: Array<ResourceKey> }> = ({ items }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    return (
        <View style={style.list}>
            {items.map((listItem, i) => (
                <View style={style.listItem} key={`list-item-${i}`}>
                    <Text caption>✅</Text>
                    <Text caption style={style.listItemText}>
                        <Trans
                            t={t}
                            i18nKey={listItem}
                            components={{ bold: <Text bold caption /> }}
                        />
                    </Text>
                </View>
            ))}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        list: {
            gap: theme.spacing.lg,
        },
        listItem: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: theme.spacing.sm,
        },
        listItemText: {
            marginTop: theme.spacing.xxs,
            flex: 1,
        },
    })

export default CheckList
