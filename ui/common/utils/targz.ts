import pako from 'pako'
import tar from 'tar-stream'

export interface File {
    name: string
    content: string | Buffer
}

/**
 * Given a list of files, returns a tar.gz buffer. Files can either use
 * string content or buffers.
 */
export async function makeTarGz(files: File[]): Promise<Buffer> {
    const packer = tar.pack()
    for (const f of files) {
        packer.entry({ name: f.name }, f.content)
    }
    packer.finalize()

    const collectedChunks: Uint8Array[] = []
    packer.on('data', chunk => collectedChunks.push(chunk))
    await new Promise(resolve => packer.on('end', resolve))

    const tarBuffer = Buffer.concat(collectedChunks)
    return Buffer.from(pako.gzip(new Uint8Array(tarBuffer)))
}
