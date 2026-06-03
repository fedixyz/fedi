import type { NextPage } from 'next'
import React from 'react'

import { MiniappApiDebugger } from '../../components/MiniappApiDebugger'

const MiniappApisPage: NextPage = () => <MiniappApiDebugger />

MiniappApisPage.noProviders = true

export default MiniappApisPage
