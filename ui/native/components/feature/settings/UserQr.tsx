import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectMatrixDisplayNameSuffix } from '@fedi/common/redux/matrix'
import { MatrixAuth } from '@fedi/common/types'
import { encodeFediMatrixUserUri } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
import QRCodeContainer from '../../ui/QRCodeContainer'

type UserQrProps = {
    matrixUser: MatrixAuth | null
    testID?: string
}

export const UserQr = ({ matrixUser }: UserQrProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    const qrValue = encodeFediMatrixUserUri(matrixUser?.userId || '')
    const displayNameSuffix = useAppSelector(selectMatrixDisplayNameSuffix)

    return (
        <Flex align="center" gap="lg">
            <QRCodeContainer
                copyMessage={t('phrases.copied-member-code')}
                copyValue={qrValue}
                qrValue={qrValue}
            />
            <Flex row center gap="xs" fullWidth>
                <Text
                    h2
                    medium
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={style.title}>
                    {matrixUser?.displayName}
                </Text>
                {displayNameSuffix && (
                    <Text
                        numberOfLines={1}
                        medium
                        adjustsFontSizeToFit
                        style={style.titleSuffix}>
                        {displayNameSuffix}
                    </Text>
                )}
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        titleSuffix: {
            color: theme.colors.grey,
            textAlign: 'center',
        },
        title: {
            textAlign: 'center',
        },
    })
