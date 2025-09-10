export const getMediaDimensions = async (
    file: File,
): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file)

        if (file.type.includes('image')) {
            const image = new Image()

            image.onload = () => {
                URL.revokeObjectURL(objectUrl)
                resolve({
                    width: image.width,
                    height: image.height,
                })
            }

            image.onerror = err => {
                URL.revokeObjectURL(objectUrl)
                reject(err)
            }

            image.src = objectUrl
        } else {
            const video = document.createElement('video')

            video.onloadedmetadata = () => {
                URL.revokeObjectURL(objectUrl)
                resolve({
                    width: video.videoWidth,
                    height: video.videoHeight,
                })
            }

            video.onerror = err => {
                URL.revokeObjectURL(objectUrl)
                reject(err)
            }

            video.src = objectUrl
        }
    })
}

export const downloadFile = (url: string, fileName: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
}
