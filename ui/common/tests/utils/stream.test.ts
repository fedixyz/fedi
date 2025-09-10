import { VectorDiff } from '../../types/bindings'
import {
    applyStreamUpdate,
    applyStreamUpdates,
    mapStreamUpdate,
    mapStreamUpdates,
    getNewStreamIds,
} from '../../utils/stream'

describe('stream utils', () => {
    describe('applyStreamUpdate', () => {
        const initialArray = ['a', 'b', 'c', 'd']

        it('handles Clear update', () => {
            const result = applyStreamUpdate(initialArray, { Clear: {} })
            expect(result).toEqual([])
        })

        it('handles PopFront update', () => {
            const result = applyStreamUpdate(initialArray, { PopFront: {} })
            expect(result).toEqual(['b', 'c', 'd'])
        })

        it('handles PopBack update', () => {
            const result = applyStreamUpdate(initialArray, { PopBack: {} })
            expect(result).toEqual(['a', 'b', 'c'])
        })

        it('handles Append update', () => {
            const update: VectorDiff<string> = {
                Append: { values: ['e', 'f'] },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
        })

        it('handles PushFront update', () => {
            const update: VectorDiff<string> = {
                PushFront: { value: 'z' },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['z', 'a', 'b', 'c', 'd'])
        })

        it('handles PushBack update', () => {
            const update: VectorDiff<string> = {
                PushBack: { value: 'z' },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['a', 'b', 'c', 'd', 'z'])
        })

        it('handles Insert update at beginning', () => {
            const update: VectorDiff<string> = {
                Insert: { index: 0, value: 'z' },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['z', 'a', 'b', 'c', 'd'])
        })

        it('handles Insert update in middle', () => {
            const update: VectorDiff<string> = {
                Insert: { index: 2, value: 'z' },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['a', 'b', 'z', 'c', 'd'])
        })

        it('handles Insert update at end', () => {
            const update: VectorDiff<string> = {
                Insert: { index: 4, value: 'z' },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['a', 'b', 'c', 'd', 'z'])
        })

        it('handles Set update', () => {
            const update: VectorDiff<string> = {
                Set: { index: 1, value: 'z' },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['a', 'z', 'c', 'd'])
        })

        it('handles Remove update from beginning', () => {
            const update: VectorDiff<string> = {
                Remove: { index: 0 },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['b', 'c', 'd'])
        })

        it('handles Remove update from middle', () => {
            const update: VectorDiff<string> = {
                Remove: { index: 1 },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['a', 'c', 'd'])
        })

        it('handles Remove update from end', () => {
            const update: VectorDiff<string> = {
                Remove: { index: 3 },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['a', 'b', 'c'])
        })

        it('handles Truncate update', () => {
            const update: VectorDiff<string> = {
                Truncate: { length: 2 },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['a', 'b'])
        })

        it('handles Reset update', () => {
            const update: VectorDiff<string> = {
                Reset: { values: ['x', 'y', 'z'] },
            }
            const result = applyStreamUpdate(initialArray, update)
            expect(result).toEqual(['x', 'y', 'z'])
        })

        it('throws error for unknown update type', () => {
            const invalidUpdate = { Unknown: { value: 'test' } } as any
            expect(() =>
                applyStreamUpdate(initialArray, invalidUpdate),
            ).toThrow('Unknown update type')
        })

        it('handles empty array operations', () => {
            const emptyArray: string[] = []

            expect(applyStreamUpdate(emptyArray, { Clear: {} })).toEqual([])
            expect(applyStreamUpdate(emptyArray, { PopFront: {} })).toEqual([])
            expect(applyStreamUpdate(emptyArray, { PopBack: {} })).toEqual([])

            const pushFront: VectorDiff<string> = {
                PushFront: { value: 'first' },
            }
            expect(applyStreamUpdate(emptyArray, pushFront)).toEqual(['first'])
        })
    })

    describe('applyStreamUpdates', () => {
        it('applies multiple updates in sequence', () => {
            const initial = ['a', 'b']
            const updates: VectorDiff<string>[] = [
                { PushBack: { value: 'c' } },
                { Insert: { index: 1, value: 'x' } },
                { Remove: { index: 0 } },
            ]

            const result = applyStreamUpdates(initial, updates)
            expect(result).toEqual(['x', 'b', 'c'])
        })

        it('handles empty updates array', () => {
            const initial = ['a', 'b', 'c']
            const result = applyStreamUpdates(initial, [])
            expect(result).toEqual(['a', 'b', 'c'])
        })

        it('handles complex sequence of updates', () => {
            const initial: string[] = []
            const updates: VectorDiff<string>[] = [
                { Reset: { values: ['1', '2', '3'] } },
                { Append: { values: ['4', '5'] } },
                { PushFront: { value: '0' } },
                { Remove: { index: 2 } },
                { Set: { index: 1, value: 'updated' } },
                { Truncate: { length: 4 } },
            ]

            const result = applyStreamUpdates(initial, updates)
            expect(result).toEqual(['0', 'updated', '3', '4'])
        })
    })

    describe('mapStreamUpdate', () => {
        const doubleString = (s: string) => s + s

        it('handles Clear update', () => {
            const result = mapStreamUpdate({ Clear: {} }, doubleString)
            expect(result).toEqual({ Clear: {} })
        })

        it('handles PopFront update', () => {
            const result = mapStreamUpdate({ PopFront: {} }, doubleString)
            expect(result).toEqual({ PopFront: {} })
        })

        it('handles PopBack update', () => {
            const result = mapStreamUpdate({ PopBack: {} }, doubleString)
            expect(result).toEqual({ PopBack: {} })
        })

        it('handles Append update', () => {
            const update: VectorDiff<string> = {
                Append: { values: ['a', 'b'] },
            }
            const result = mapStreamUpdate(update, doubleString)
            expect(result).toEqual({
                Append: { values: ['aa', 'bb'] },
            })
        })

        it('handles PushFront update', () => {
            const update: VectorDiff<string> = {
                PushFront: { value: 'test' },
            }
            const result = mapStreamUpdate(update, doubleString)
            expect(result).toEqual({
                PushFront: { value: 'testtest' },
            })
        })

        it('handles PushBack update', () => {
            const update: VectorDiff<string> = {
                PushBack: { value: 'test' },
            }
            const result = mapStreamUpdate(update, doubleString)
            expect(result).toEqual({
                PushBack: { value: 'testtest' },
            })
        })

        it('handles Insert update', () => {
            const update: VectorDiff<string> = {
                Insert: { index: 1, value: 'test' },
            }
            const result = mapStreamUpdate(update, doubleString)
            expect(result).toEqual({
                Insert: { index: 1, value: 'testtest' },
            })
        })

        it('handles Set update', () => {
            const update: VectorDiff<string> = {
                Set: { index: 2, value: 'test' },
            }
            const result = mapStreamUpdate(update, doubleString)
            expect(result).toEqual({
                Set: { index: 2, value: 'testtest' },
            })
        })

        it('handles Remove update', () => {
            const update: VectorDiff<string> = {
                Remove: { index: 1 },
            }
            const result = mapStreamUpdate(update, doubleString)
            expect(result).toEqual({
                Remove: { index: 1 },
            })
        })

        it('handles Truncate update', () => {
            const update: VectorDiff<string> = {
                Truncate: { length: 5 },
            }
            const result = mapStreamUpdate(update, doubleString)
            expect(result).toEqual({
                Truncate: { length: 5 },
            })
        })

        it('handles Reset update', () => {
            const update: VectorDiff<string> = {
                Reset: { values: ['a', 'b', 'c'] },
            }
            const result = mapStreamUpdate(update, doubleString)
            expect(result).toEqual({
                Reset: { values: ['aa', 'bb', 'cc'] },
            })
        })

        it('throws error for unknown update type', () => {
            const invalidUpdate = { Unknown: { value: 'test' } } as any
            expect(() => mapStreamUpdate(invalidUpdate, doubleString)).toThrow(
                'Unknown update type',
            )
        })

        it('works with type transformation', () => {
            const stringToNumber = (s: string) => s.length
            const update: VectorDiff<string> = {
                Append: { values: ['hello', 'world'] },
            }
            const result = mapStreamUpdate(update, stringToNumber)
            expect(result).toEqual({
                Append: { values: [5, 5] },
            })
        })
    })

    describe('mapStreamUpdates', () => {
        const toUpperCase = (s: string) => s.toUpperCase()

        it('maps multiple updates', () => {
            const updates: VectorDiff<string>[] = [
                { PushBack: { value: 'hello' } },
                { Append: { values: ['world', 'test'] } },
                { Clear: {} },
                { Reset: { values: ['new', 'data'] } },
            ]

            const result = mapStreamUpdates(updates, toUpperCase)
            expect(result).toEqual([
                { PushBack: { value: 'HELLO' } },
                { Append: { values: ['WORLD', 'TEST'] } },
                { Clear: {} },
                { Reset: { values: ['NEW', 'DATA'] } },
            ])
        })

        it('handles empty updates array', () => {
            const result = mapStreamUpdates([], toUpperCase)
            expect(result).toEqual([])
        })
    })

    describe('getNewStreamIds', () => {
        interface TestItem {
            id: string
            name: string
        }

        const getId = (item: TestItem) => item.id

        it('extracts IDs from Insert updates', () => {
            const updates: VectorDiff<TestItem>[] = [
                { Insert: { index: 0, value: { id: 'id1', name: 'test1' } } },
                { Insert: { index: 1, value: { id: 'id2', name: 'test2' } } },
            ]

            const result = getNewStreamIds(updates, getId)
            expect(result).toEqual(new Set(['id1', 'id2']))
        })

        it('extracts IDs from PushFront updates', () => {
            const updates: VectorDiff<TestItem>[] = [
                { PushFront: { value: { id: 'id1', name: 'test1' } } },
            ]

            const result = getNewStreamIds(updates, getId)
            expect(result).toEqual(new Set(['id1']))
        })

        it('extracts IDs from PushBack updates', () => {
            const updates: VectorDiff<TestItem>[] = [
                { PushBack: { value: { id: 'id1', name: 'test1' } } },
            ]

            const result = getNewStreamIds(updates, getId)
            expect(result).toEqual(new Set(['id1']))
        })

        it('extracts IDs from Set updates', () => {
            const updates: VectorDiff<TestItem>[] = [
                { Set: { index: 0, value: { id: 'id1', name: 'test1' } } },
            ]

            const result = getNewStreamIds(updates, getId)
            expect(result).toEqual(new Set(['id1']))
        })

        it('extracts IDs from Append updates', () => {
            const updates: VectorDiff<TestItem>[] = [
                {
                    Append: {
                        values: [
                            { id: 'id1', name: 'test1' },
                            { id: 'id2', name: 'test2' },
                        ],
                    },
                },
            ]

            const result = getNewStreamIds(updates, getId)
            expect(result).toEqual(new Set(['id1', 'id2']))
        })

        it('extracts IDs from Reset updates', () => {
            const updates: VectorDiff<TestItem>[] = [
                {
                    Reset: {
                        values: [
                            { id: 'id1', name: 'test1' },
                            { id: 'id2', name: 'test2' },
                            { id: 'id3', name: 'test3' },
                        ],
                    },
                },
            ]

            const result = getNewStreamIds(updates, getId)
            expect(result).toEqual(new Set(['id1', 'id2', 'id3']))
        })

        it('ignores updates that do not add items', () => {
            const updates: VectorDiff<TestItem>[] = [
                { Clear: {} },
                { PopFront: {} },
                { PopBack: {} },
                { Remove: { index: 0 } },
                { Truncate: { length: 5 } },
            ]

            const result = getNewStreamIds(updates, getId)
            expect(result).toEqual(new Set())
        })

        it('handles mixed updates', () => {
            const updates: VectorDiff<TestItem>[] = [
                { PushFront: { value: { id: 'id1', name: 'test1' } } },
                { Clear: {} },
                {
                    Append: {
                        values: [
                            { id: 'id2', name: 'test2' },
                            { id: 'id3', name: 'test3' },
                        ],
                    },
                },
                { Remove: { index: 0 } },
                { Set: { index: 1, value: { id: 'id4', name: 'test4' } } },
            ]

            const result = getNewStreamIds(updates, getId)
            expect(result).toEqual(new Set(['id1', 'id2', 'id3', 'id4']))
        })

        it('filters out falsy IDs', () => {
            const getIdWithFalsy = (item: TestItem) => {
                if (item.name === 'skip') return null
                if (item.name === 'empty') return ''
                if (item.name === 'false') return false
                return item.id
            }

            const updates: VectorDiff<TestItem>[] = [
                {
                    Append: {
                        values: [
                            { id: 'id1', name: 'valid' },
                            { id: 'id2', name: 'skip' },
                            { id: 'id3', name: 'empty' },
                            { id: 'id4', name: 'false' },
                            { id: 'id5', name: 'valid2' },
                        ],
                    },
                },
            ]

            const result = getNewStreamIds(updates, getIdWithFalsy)
            expect(result).toEqual(new Set(['id1', 'id5']))
        })

        it('handles duplicate IDs', () => {
            const updates: VectorDiff<TestItem>[] = [
                { PushFront: { value: { id: 'duplicate', name: 'test1' } } },
                { PushBack: { value: { id: 'duplicate', name: 'test2' } } },
                {
                    Insert: {
                        index: 1,
                        value: { id: 'unique', name: 'test3' },
                    },
                },
            ]

            const result = getNewStreamIds(updates, getId)
            expect(result).toEqual(new Set(['duplicate', 'unique']))
        })

        it('handles empty updates array', () => {
            const result = getNewStreamIds([], getId)
            expect(result).toEqual(new Set())
        })
    })

    describe('complex integration test with many operations', () => {
        it('applies many updates with string items and verifies final state', () => {
            // Start with initial state
            const initialState = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

            const updates: VectorDiff<string>[] = [
                { Remove: { index: 0 } },
                { PushFront: { value: 'start' } },
                { PushBack: { value: 'end' } },
                { Append: { values: ['x1', 'x2', 'x3'] } },
                { Insert: { index: 2, value: 'mid1' } },
                { Insert: { index: 0, value: 'first' } },
                { Insert: { index: 7, value: 'mid2' } },
                { Set: { index: 3, value: 'replaced1' } },
                { Set: { index: 10, value: 'replaced2' } },
                { Remove: { index: 1 } },
                { Remove: { index: 8 } },
                { PopFront: {} },
                { PopBack: {} },
                { Insert: { index: 5, value: 'inserted' } },
                { PushFront: { value: 'newstart' } },
                { Append: { values: ['y1', 'y2'] } },
                { Truncate: { length: 10 } },
                { Set: { index: 9, value: 'final' } },
                { Insert: { index: 5, value: 'extra' } },
                { Remove: { index: 2 } },
                { PushBack: { value: 'last' } },
                { PopFront: {} },
                { Append: { values: ['z1', 'z2', 'z3'] } },
                { Remove: { index: 7 } },
                { Set: { index: 0, value: 'beginning' } },
                { Truncate: { length: 8 } },
            ]

            const finalState = applyStreamUpdates(initialState, updates)

            expect(finalState).toEqual([
                'beginning',
                'c',
                'd',
                'extra',
                'e',
                'inserted',
                'mid2',
                'final',
            ])

            expect(finalState).toHaveLength(8)
            expect(finalState[0]).toBe('beginning')
            expect(finalState[7]).toBe('final')

            const toUpperCase = (s: string) => s.toUpperCase()
            const mappedUpdates = mapStreamUpdates(updates, toUpperCase)
            const mappedFinalState = applyStreamUpdates(
                initialState.map(toUpperCase),
                mappedUpdates,
            )

            expect(mappedFinalState).toEqual([
                'BEGINNING',
                'C',
                'D',
                'EXTRA',
                'E',
                'INSERTED',
                'MID2',
                'FINAL',
            ])

            const getId = (item: string) => item
            const newIds = getNewStreamIds(updates, getId)
            const expectedNewIds = new Set([
                'start',
                'end',
                'x1',
                'x2',
                'x3',
                'mid1',
                'first',
                'mid2',
                'replaced1',
                'replaced2',
                'inserted',
                'newstart',
                'y1',
                'y2',
                'final',
                'extra',
                'last',
                'z1',
                'z2',
                'z3',
                'beginning',
            ])
            expect(newIds).toEqual(expectedNewIds)
        })
    })
})
