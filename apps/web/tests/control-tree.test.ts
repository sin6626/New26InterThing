import {
  describe,
  expect,
  it,
} from 'vitest'

import type { ControlField } from '@new26interthing/shared'
import {
  buildVisibleControlTree,
  isControlFieldDisabled,
  requiresForceOff,
  syncRuntimeControlFields,
} from '../app/features/control/control-tree'

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

  it('synchronizes master to off and disables it after a safety fault', () => {
    const fields = [
      field({ configId: 0, name: '控制模式', topic: 'master', value: 'on' }),
      field({ configId: 4, name: '水泵开关', topic: 'pump', value: 'off' }),
    ]

    syncRuntimeControlFields(fields, {
      enabled: false,
      desiredPump: 'off',
      desiredHeater: 'off',
    })

    expect(fields[0]?.value).toBe('off')
    expect(fields[1]?.value).toBe('off')
    expect(isControlFieldDisabled(fields[0]!, undefined, true)).toBe(true)
    expect(isControlFieldDisabled(fields[1]!, undefined, true)).toBe(false)
  })

  it('synchronizes all runtime switches from the automation snapshot', () => {
    const fields = [
      field({ configId: 0, topic: 'master', value: 'off' }),
      field({ configId: 23, topic: 'pump', value: 'off' }),
      field({ configId: 24, topic: 'heater', value: 'on' }),
    ]

    syncRuntimeControlFields(fields, {
      enabled: true,
      desiredPump: 'on',
      desiredHeater: 'off',
    })

    expect(fields.map(item => item.value)).toEqual(['on', 'on', 'off'])
  })

  it('offers force-off only when a device actuator is expected off but not actually off', () => {
    const runtime = {
      desiredPump: 'off' as const,
      actualPump: 'on' as const,
      desiredHeater: 'off' as const,
      actualHeater: 'off' as const,
    }

    expect(requiresForceOff(field({ topic: 'pump' }), runtime)).toBe(true)
    expect(requiresForceOff(field({ topic: 'heater' }), runtime)).toBe(false)
    expect(requiresForceOff(field({ topic: 'master' }), runtime)).toBe(false)
  })
})
