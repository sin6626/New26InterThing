import { describe, expect, it, vi } from 'vitest'

import { createAutomationConfigLoader } from '../src/modules/automation/adapters/config.mysql.js'

const values = {
  temperature_control_strategy: 'hysteresis',
  target_temperature: '-10',
  temperature_hysteresis: '-2',
  min_safe_flow: '-1',
  build_flow_timeout: '-5',
  cooling_delay: '-5',
  data_timeout: '-3',
  low_flow_confirm_time: '-5',
  max_safe_pressure: '-100',
  max_safe_temperature: '-5',
  temp_reversed_confirm_time: '-5',
  dry_heating_timeout: '-60',
  dry_heating_temp_diff: '-0.1',
  pid_kp: '-1',
  pid_ki: '-1',
  pid_kd: '-1',
  pid_cycle_time: '-10',
  pid_min_on_time: '-2',
  pid_min_off_time: '-2',
  pid_overshoot_allowance: '-1',
  pid_resume_hysteresis: '-1',
  command_timeout: '-3',
  pipe_inner_diameter: '-20',
}

const pool = () => ({
  query: vi.fn().mockResolvedValue([
    Object.entries(values).map(([topic, value]) => ({ topic, value })),
  ]),
})

describe('automation config loader', () => {
  it('keeps strict business validation in normal mode', async () => {
    const load = createAutomationConfigLoader(pool() as never)
    await expect(load()).rejects.toThrow('target_temperature 必须大于 0')
  })

  it('accepts finite negative business values only when debug mode requests it', async () => {
    const load = createAutomationConfigLoader(pool() as never)
    await expect(load({ allowUnsafeBusinessValues: true })).resolves.toMatchObject({
      targetTemperature: -10,
      minSafeFlow: -1,
      pid: { kp: -1, cycleSeconds: -10 },
    })
  })
})
