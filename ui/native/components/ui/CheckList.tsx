import { Text, Theme, useTheme } from '@rneui/themed'
import { ResourceKey } from 'i18next'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Row, Column } from './Flex'

const CheckList: React.FC<{ items: Array<ResourceKey> }> = ({ items }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    return (
        <Column gap="lg">
            {items.map((listItem, i) => (
                <Row align="start" gap="sm" key={`list-item-${i}`}>
                    <Text caption>✅</Text>
                    <Text caption style={style.listItemText}>
                        <Trans
                            t={t}
                            i18nKey={listItem}
                            components={{ bold: <Text bold caption /> }}
                        />
                    </Text>
                </Row>
            ))}
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        listItemText: {
            marginTop: theme.spacing.xxs,
            flex: 1,
        },
    })

export default CheckList
