import { describe, expect, it, vi } from 'vitest'

import { createHydraulicDiagnosisManager } from '../src/modules/diagnostics/hydraulic-diagnosis-manager.js'

describe('hydraulic diagnosis manager', () => {
  it('applies emergency protection before persisting a leak diagnosis', async () => {
    const order: string[] = []
    const manager = createHydraulicDiagnosisManager({
      loadConfig: vi.fn().mockResolvedValue({
        deviceOfflineTimeoutSeconds: 5,
        dataTimeoutSeconds: 3,
        minSafeFlow: 0.5,
        minOperatingPressure: 20,
        maxSafePressure: 130,
        diagnosisConfirmSeconds: 2,
      }),
      emit: vi.fn(),
      protect: vi.fn().mockImplementation(async (diagnosis) => {
        if (diagnosis.code === 'HYDRAULIC_LEAK_OR_BURST') order.push('protect')
      }),
      reportFault: vi.fn().mockImplementation(async (_device, code) => {
        if (code === 'HYDRAULIC_LEAK_OR_BURST') order.push('report')
      }),
    })
    const normalReading = {
      recordedAt: 0,
      flowRate: 2,
      pressure: 80,
      inletTemperature: 20,
      outletTemperature: 21,
      actualPump: 'on' as const,
      actualHeater: 'off' as const,
    }
    for (const recordedAt of [1_000, 2_000, 3_000]) {
      await manager.handleReading('device-1', { ...normalReading, recordedAt }, 'running')
    }
    await manager.handleReading('device-1', {
      ...normalReading,
      recordedAt: 4_000,
      pressure: 30,
      flowRate: 0.5,
    }, 'running')

    expect(order).toEqual(['protect', 'report'])
  })
})
