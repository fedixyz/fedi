import {
    pick,
    DocumentPickerResponse,
    types,
} from '@react-native-documents/picker'
import { useNavigation } from '@react-navigation/native'
import { Button } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import RNFS from 'react-native-fs'

import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { NavigationHook } from '../../../types/navigation'

const log = makeLog('SelectRecoveryFileButton')

const SelectRecoveryFileButton: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const [validationInProgress, setValidationInProgress] =
        useState<boolean>(false)
    const [result, setResult] = useState<
        DocumentPickerResponse | undefined | null
    >()

    const openFileExplorer = async () => {
        try {
            const responses = await pick({
                type: types.allFiles,
            })
            const response = responses[0]

            if (!response) {
                return
            }

            setValidationInProgress(true)
            setResult(response)
        } catch (error) {
            const typedError = error as Error
            log.error('DocumentPicker Error: ', typedError)
            // Hiding this because it shows the toast when user closes the dialogue ...
            // toast?.show(typedError?.message, 3000)
        }
    }

    useEffect(() => {
        const checkForValidFile = async () => {
            if (!result) return
            // copy file to docs directory so rust can read it
            const dest = `${RNFS.DocumentDirectoryPath}/backup.fedi`
            // remove existing file
            try {
                await RNFS.unlink(dest)
            } catch (e) {
                log.error('no existing file to remove')
            }
            // copy file to docs dir
            await RNFS.copyFile(result.uri, dest)
            // validate file
            try {
                await fedimint.validateRecoveryFile(dest)
                navigation.replace('SelectRecoveryFileSuccess', {
                    fileName: dest,
                })
            } catch (error) {
                navigation.replace('SelectRecoveryFileFailure', {
                    fileName: dest,
                })
            }
            setValidationInProgress(false)
        }

        if (validationInProgress && result) {
            setTimeout(() => {
                checkForValidFile()
            })
        }
    }, [navigation, result, validationInProgress])

    return (
        <Button
            title={t('feature.recovery.search-files')}
            containerStyle={styles.searchButton}
            onPress={openFileExplorer}
            loading={validationInProgress}
        />
    )
}

const styles = StyleSheet.create({
    searchButton: {
        width: '100%',
        marginTop: 'auto',
    },
})

export default SelectRecoveryFileButton
