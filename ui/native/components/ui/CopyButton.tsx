import { useToast } from '@fedi/common/hooks/toast'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { PressableIcon } from './PressableIcon'

export function CopyButton({ value }: { value: string }) {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()

    return (
        <PressableIcon
            svgName="Copy"
            svgProps={{ size: 16, color: theme.colors.grey }}
            onPress={() => {
                if (!value) return
                Clipboard.setString(value)
                toast.show({
                    status: 'success',
                    content: t('phrases.copied-to-clipboard'),
                })
            }}
        />
    )
}
