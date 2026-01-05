import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { DEEPLINK_HOSTS, LINK_PATH } from '@fedi/common/constants/linking'
import { selectMatrixDisplayNameSuffix } from '@fedi/common/redux/matrix'
import { MatrixAuth } from '@fedi/common/types'
import { encodeFediMatrixUserUri } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import { Row, Column } from '../../ui/Flex'
import QRCodeContainer from '../../ui/QRCodeContainer'

type UserQrProps = {
    matrixUser: MatrixAuth | null
    testID?: string
}

const generateUniversalLink = (userId: string): string => {
    if (!userId) return ''
    return `https://${DEEPLINK_HOSTS[0]}${LINK_PATH}?screen=user&id=${userId}`
}

export const UserQr = ({ matrixUser }: UserQrProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    const qrValue = encodeFediMatrixUserUri(matrixUser?.userId || '')
    const universalLink = generateUniversalLink(matrixUser?.userId || '')
    const displayNameSuffix = useAppSelector(selectMatrixDisplayNameSuffix)

    return (
        <Column align="center" gap="lg">
            <QRCodeContainer
                copyMessage={t('phrases.copied-member-code')}
                qrValue={qrValue}
                useShare={true}
                shareValue={universalLink}
            />
            <Row center gap="xs" fullWidth>
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
            </Row>
        </Column>
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
