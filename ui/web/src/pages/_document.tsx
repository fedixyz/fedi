import NextDocument, { Html, Head, Main, NextScript } from 'next/document'
import React from 'react'

import { getCssText } from '../styles'

export default class Document extends NextDocument {
    render() {
        return (
            <Html lang="en">
                <Head>
                    <style
                        id="stitches"
                        dangerouslySetInnerHTML={{ __html: getCssText() }}
                    />
                </Head>
                <body>
                    <Main />
                    <NextScript />
                </body>
            </Html>
        )
    }
}
