import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectMatrixDisplayNameSuffix } from '@fedi/common/redux/matrix'
import { MatrixAuth } from '@fedi/common/types'
import { encodeFediMatrixUserUri } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import QRCodeContainer from '../../ui/QRCodeContainer'

type UserQrProps = {
    matrixUser: MatrixAuth | null
}

export const UserQr = ({ matrixUser }: UserQrProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    const qrValue = encodeFediMatrixUserUri(matrixUser?.userId || '')
    const displayNameSuffix = useAppSelector(selectMatrixDisplayNameSuffix)

    return (
        <View style={style.qrCode}>
            <QRCodeContainer
                copyMessage={t('phrases.copied-member-code')}
                copyValue={qrValue}
                qrValue={qrValue}
            />
            <View style={style.titleContainer}>
                <Text h2 medium numberOfLines={1} adjustsFontSizeToFit>
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
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        qrCode: {
            alignItems: 'center',
            gap: theme.spacing.lg,
        },
        titleSuffix: {
            color: theme.colors.grey,
        },
        titleContainer: {
            textAlign: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            gap: theme.spacing.xs,
        },
    })
