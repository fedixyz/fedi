import { Image } from '@rneui/themed'
import React from 'react'

import { Images } from '../../../assets/images'
import Header from '../../ui/Header'

const EulaHeader: React.FC = () => {
    return (
        <Header
            backButton
            headerCenter={
                <Image
                    style={{ width: 100, height: 20 }}
                    source={Images.FediLogo}
                    resizeMode="contain"
                />
            }
        />
    )
}

export default EulaHeader
