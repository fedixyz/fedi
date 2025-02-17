import { QRCode } from 'qrcode'

interface QRCodeStyleOptions {
    moduleShape?: 'dot' | 'square'
    hideLogo?: boolean
    logoOverrideUrl?: string
}

/**
 * Given a QRCode generated by `qrcode`, generate a custom styled SVG.
 * Based off of https://gist.github.com/artemkrynkin/e6bf05d0f61ca3b2ed7e51291ad3a0bf
 * and modified to match our styles.
 */
export function renderStyledQrSvg(
    qrData: QRCode,
    options: QRCodeStyleOptions = {},
) {
    removeModules(qrData.modules, options.hideLogo)

    const data = qrData.modules.data
    const size = qrData.modules.size
    const moduleSize = 97
    const randomId = Math.random().toString(36).substring(2, 15)

    const moduleShape = size > 60 ? 'square' : options.moduleShape || 'dot'

    const avatarPictureDimension = 700
    const avatarPicturePosition =
        (moduleSize * size) / 2 - avatarPictureDimension / 2

    const qrSvg = `
        <svg
            viewBox="0 0 ${moduleSize * size} ${moduleSize * size}"
            width="250px"
            height="250px"
            version="1.1"
            xml:space="preserve"
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink"
        >
            <defs>
                ${
                    moduleShape === 'square'
                        ? `<rect id="dot-${randomId}" width="100" height="100" fill="currentColor" />`
                        : `<circle id="dot-${randomId}" cx="45" cy="45" r="45" fill="currentColor" />`
                }
                <g id="point-${randomId}">
                    <rect x="0" y="0" width="695" height="700" rx="200" fill="currentColor" stroke-width="8"/>
                    <rect x="115" y="115" width="465" height="465" rx="40" fill="white"/>
                    <rect x="180" y="180" width="335" height="335" rx="20" fill="currentColor"/>
                </g>
                ${
                    options.hideLogo && !options.logoOverrideUrl
                        ? ''
                        : `<g id="logo-${randomId}">
                        <rect width="990" height="990" rx="200" fill="currentColor"/>
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M580.179 224H224V766.298H331.619V331.716H580.179V224ZM495.21 581.688C542.888 581.688 581.688 542.888 581.688 495.21C581.688 447.531 542.888 408.609 495.21 408.609C447.531 408.609 408.609 447.409 408.609 495.21C408.609 543.01 447.409 581.688 495.21 581.688ZM410.119 658.68H658.583V224H766.298V766.298H410.119V658.68Z" fill="white"/>
                    </g>`
                }
            </defs>
            <g transform="translate(0,0)">
                ${renderQrDots(data, size, moduleSize, randomId)}
                <use fill-rule="evenodd" transform="translate(0,0)" xlink:href="#point-${randomId}"/>
                <use fill-rule="evenodd" transform="translate(${
                    size * moduleSize - 700
                },0)" xlink:href="#point-${randomId}"/>
                <use fill-rule="evenodd" transform="translate(0,${
                    size * moduleSize - 700
                })" xlink:href="#point-${randomId}"/>
                ${
                    options.hideLogo || !!options.logoOverrideUrl
                        ? ''
                        : `<use fill-rule="evenodd" transform="translate(${
                              size * 0.5 * moduleSize - 280
                          }, ${
                              size * 0.5 * moduleSize - 290
                          }) scale(0.6)" xlink:href="#logo-${randomId}" />`
                }
            </g>

            ${
                options.logoOverrideUrl && !options.hideLogo
                    ? `<clipPath id="rounded-avatar">
                        <rect x="${avatarPicturePosition}" y="${avatarPicturePosition}" width="${avatarPictureDimension}" height="${avatarPictureDimension}" rx="${
                            avatarPictureDimension / 2
                        }" ry="${avatarPictureDimension / 2}" />
                    </clipPath>

                    <image href="${
                        options.logoOverrideUrl
                    }" x="${avatarPicturePosition}" y=${avatarPicturePosition} width="${avatarPictureDimension}", height="${avatarPictureDimension}" clip-path="url(#rounded-avatar)" />

                    <rect x="${avatarPicturePosition}" y="${avatarPicturePosition}" width="${avatarPictureDimension}" height="${avatarPictureDimension}" rx="${
                        avatarPictureDimension / 2
                    }" ry="${
                        avatarPictureDimension / 2
                    }" fill="none" stroke="black" stroke-width="32" />`
                    : ''
            }
        </svg>
`

    const svg = `
        <svg
            viewBox="0 0 250 250"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink"
        >
            <defs>
                <g id="qr-${randomId}" style="color: inherit">${qrSvg}</g>
            </defs>
            <g>
                <use
                    x="0"
                    y="0"
                    xlink:href="#qr-${randomId}"
                    transform="scale(1)"
                    xmlns="http://www.w3.org/2000/svg"
                    xmlns:xlink="http://www.w3.org/1999/xlink"
                />
            </g>
        </svg>
    `
    return svg
}

/**
 * Removes the center modules for placing logo.
 */
function removeModules(matrix: QRCode['modules'], hideLogo?: boolean) {
    const size = matrix.size

    const finderPatternModules = size - 7

    const pos = [
        // top-left
        [0, 0],
        // top-right
        [finderPatternModules, 0],
        // bottom-left
        [0, finderPatternModules],
    ]
    if (!hideLogo) {
        // center
        const centerModules = (size - 7 * 3) / 2 + 7
        pos.push([centerModules, centerModules])
    }

    for (let i = 0; i < pos.length; i++) {
        const row = pos[i][0]
        const col = pos[i][1]

        for (let r = -1; r <= 7; r++) {
            if (row + r <= -1 || size <= row + r) continue

            for (let c = -1; c <= 7; c++) {
                if (col + c <= -1 || size <= col + c) continue

                matrix.set(row + r, col + c, 0, true)
            }
        }
    }
}

function renderQrDots(
    data: Uint8Array,
    size: number,
    moduleSize: number,
    randomId: string,
) {
    let svg = ''

    for (let i = 0; i < data.length; i++) {
        if (data[i]) {
            const col = Math.floor(i % size)
            const row = Math.floor(i / size)
            svg += `<g transform="translate(${col * moduleSize}, ${
                row * moduleSize
            })"><use xlink:href="#dot-${randomId}"/></g>`
        }
    }

    return svg
}
