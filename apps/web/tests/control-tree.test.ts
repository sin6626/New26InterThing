import {
  describe,
  expect,
  it,
} from 'vitest'

import type { ControlField } from '@new26interthing/shared'
import { buildVisibleControlTree } from '../app/features/control/control-tree'

const field = (overrides: Partial<ControlField>): ControlField => ({
  configId: 0,
  parentId: null,
  parentValue: null,
  name: '',
  type: 'switch',
  min: null,
  max: null,
  options: [],
  topic: '',
  actionKind: 'parameter',
  value: null,
  heaterStartBlocked: false,
  automaticStartBlocked: false,
  ...overrides,
})

describe('control tree', () => {
  it('matches contest_admin id order and selects the active mode branch', () => {
    const tree = buildVisibleControlTree([
      field({ configId: 20, parentId: 0, parentValue: 'on', name: '流量下限', type: 'slider' }),
      field({ configId: 0, name: '控制模式', topic: 'master', value: 'on' }),
      field({ configId: 4, parentId: 0, parentValue: 'off', name: '手动水泵' }),
      field({ configId: 10, parentId: 0, parentValue: 'on', name: '结束时间', type: 'datetime' }),
      field({ configId: 9, parentId: 0, parentValue: 'on', name: '控温策略', type: 'radio' }),
    ])

    expect(tree[0]?.children.map(item => [item.configId, item.type])).toEqual([
      [9, 'radio'],
      [10, 'datetime'],
      [20, 'slider'],
    ])
  })
})
