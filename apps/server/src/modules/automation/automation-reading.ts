import type { AutomationReading } from './automation.types.js'

type SensorValues = Record<string, string | number | null>

const numeric = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const actuator = (value: unknown) => {
  if (value === 'on' || value === 1 || value === '1') return 'on' as const
  if (value === 'off' || value === 0 || value === '0') return 'off' as const
  return 'unknown' as const
}

export const normalizeAutomationReading = (
  values: SensorValues,
  recordedAt: number,
): AutomationReading => ({
  recordedAt,
  pressure: numeric(values.pressure ?? values.field4),
  outletTemperature: numeric(values.temp_out ?? values.field2),
  inletTemperature: numeric(values.temp_in ?? values.field3),
  flowRate: numeric(values.flow_rate ?? values.field5),
  actualHeater: actuator(values.heat_Y1 ?? values.field6),
  actualPump: actuator(values.water_Y2 ?? values.field7),
})
