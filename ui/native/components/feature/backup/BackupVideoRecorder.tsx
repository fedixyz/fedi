import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { useBackupRecoveryContext } from '../../../state/contexts/BackupRecoveryContext'
import RecordVideo from './RecordVideo'
import ReviewVideo from './ReviewVideo'

const BackupVideoRecorder = () => {
    const { theme } = useTheme()
    const { state } = useBackupRecoveryContext()
    const { videoFile } = state
    return (
        <View style={styles(theme).container}>
            {videoFile ? <ReviewVideo /> : <RecordVideo />}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            width: '100%',
            paddingHorizontal: theme.spacing.md,
        },
    })

export default BackupVideoRecorder
