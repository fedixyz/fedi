import { exportBridgeLogFiles } from '../../../utils/log'

type MockStream = {
    onData: (callback: (chunk: string) => void) => void
    onError: (callback: (error: Error) => void) => void
    onEnd: (callback: () => void) => void
    open: () => void
}

const mockLs = jest.fn<Promise<string[]>, [string]>()
const mockReadStream = jest.fn<
    Promise<MockStream>,
    [string, 'utf8' | 'base64', number]
>()

jest.mock('rn-fetch-blob', () => ({
    fs: {
        dirs: {
            DocumentDir: '/mock/documents',
        },
        ls: (...args: [string]) => mockLs(...args),
        readStream: (...args: [string, 'utf8' | 'base64', number]) =>
            mockReadStream(...args),
    },
}))

function createReadStream(content: string) {
    let handleData: ((chunk: string) => void) | undefined
    let handleEnd: (() => void) | undefined

    return Promise.resolve({
        onData(callback: (chunk: string) => void) {
            handleData = callback
        },
        onError(callback: (error: Error) => void) {
            return callback
        },
        onEnd(callback: () => void) {
            handleEnd = callback
        },
        open() {
            if (handleData) {
                handleData(content)
            }
            if (handleEnd) {
                handleEnd()
            }
        },
    })
}

describe('native bridge log export', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('attaches bridge log artifacts matching the export prefixes', async () => {
        const compressedContent = Buffer.from(
            'compressed bridge logs',
        ).toString('base64')

        mockLs.mockResolvedValue([
            'fedi.log',
            'fedi.logz.20001',
            'fedi.log.20001',
            'fedi.log.20002',
            'fedi.log.1',
        ])
        mockReadStream.mockImplementation((path, encoding) => {
            if (path.endsWith('fedi.log.20001')) {
                return createReadStream(
                    encoding === 'base64'
                        ? Buffer.from('raw bridge logs 1').toString('base64')
                        : 'raw bridge logs 1',
                )
            }

            if (path.endsWith('fedi.log.20002')) {
                return createReadStream(
                    encoding === 'base64'
                        ? Buffer.from('raw bridge logs 2').toString('base64')
                        : 'raw bridge logs 2',
                )
            }

            if (path.endsWith('fedi.logz.20001')) {
                return createReadStream(compressedContent)
            }

            if (path.endsWith('fedi.log.1')) {
                return createReadStream(
                    encoding === 'base64'
                        ? Buffer.from('legacy bridge logs').toString('base64')
                        : 'legacy bridge logs',
                )
            }

            return createReadStream('')
        })

        // Raw files are listed and read first, then compressed files
        await expect(exportBridgeLogFiles()).resolves.toEqual([
            {
                name: 'fedi.log.20001',
                content: Buffer.from('raw bridge logs 1'),
            },
            {
                name: 'fedi.log.20002',
                content: Buffer.from('raw bridge logs 2'),
            },
            {
                name: 'fedi.log.1',
                content: Buffer.from('legacy bridge logs'),
            },
            {
                name: 'fedi.logz.20001',
                content: Buffer.from('compressed bridge logs'),
            },
        ])

        // ls is called twice (once per pass)
        expect(mockLs).toHaveBeenCalledTimes(2)

        expect(mockReadStream).toHaveBeenNthCalledWith(
            1,
            '/mock/documents/fedi.log.20001',
            'base64',
            100002,
        )
        expect(mockReadStream).toHaveBeenNthCalledWith(
            2,
            '/mock/documents/fedi.log.20002',
            'base64',
            100002,
        )
        expect(mockReadStream).toHaveBeenNthCalledWith(
            3,
            '/mock/documents/fedi.log.1',
            'base64',
            100002,
        )
        expect(mockReadStream).toHaveBeenNthCalledWith(
            4,
            '/mock/documents/fedi.logz.20001',
            'base64',
            100002,
        )
    })

    it('ignores files that fail while exporting', async () => {
        mockLs.mockResolvedValue(['fedi.log.20001', 'fedi.logz.20001'])
        mockReadStream.mockImplementation((path, encoding) => {
            if (path.endsWith('fedi.log.20001')) {
                return Promise.reject(new Error('permission denied'))
            }

            if (path.endsWith('fedi.logz.20001')) {
                return createReadStream(
                    encoding === 'base64'
                        ? Buffer.from('compressed bridge logs').toString(
                              'base64',
                          )
                        : 'compressed bridge logs',
                )
            }

            return createReadStream('')
        })

        // Raw pass skips the failed file; compressed pass returns its file
        await expect(exportBridgeLogFiles()).resolves.toEqual([
            {
                name: 'fedi.logz.20001',
                content: Buffer.from('compressed bridge logs'),
            },
        ])
    })

    it("fresh install — only today's raw log", async () => {
        mockLs.mockResolvedValue(['fedi.log.20566'])
        mockReadStream.mockImplementation((_path, _encoding) =>
            createReadStream(Buffer.from('today only').toString('base64')),
        )

        await expect(exportBridgeLogFiles()).resolves.toEqual([
            { name: 'fedi.log.20566', content: Buffer.from('today only') },
        ])
    })

    it('no bridge log files in directory', async () => {
        mockLs.mockResolvedValue(['global.db', 'matrix', 'fedi_file_v0'])

        await expect(exportBridgeLogFiles()).resolves.toEqual([])
        expect(mockReadStream).not.toHaveBeenCalled()
    })

    it('directory listing fails gracefully', async () => {
        mockLs.mockRejectedValue(new Error('ENOENT'))

        await expect(exportBridgeLogFiles()).resolves.toEqual([])
    })

    it('excludes bare fedi.log and fedi.logz without suffixes', async () => {
        mockLs.mockResolvedValue([
            'fedi.log',
            'fedi.logz',
            'something.log.20565',
            'fedi.log.20566',
        ])
        mockReadStream.mockImplementation((_path, _encoding) =>
            createReadStream(Buffer.from('data').toString('base64')),
        )

        const result = await exportBridgeLogFiles()
        expect(result.map(f => f.name)).toEqual(['fedi.log.20566'])
    })
})
