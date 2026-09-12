import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import type { ControlRepository } from '../src/modules/control/control.repository.js'
import { createControlService } from '../src/modules/control/control.service.js'

const definition = {
  configId: 23,
  name: '水泵开关',
  fieldType: '1',
  topic: 'pump',
  publishTopic: 'command',
  payloadTemplate: '{"mb":"{{mapped_value}}"}',
  valueMap: '{"on":"OPEN","off":"CLOSE"}',
  min: null,
  max: null,
  options: [],
  oldValue: 'off',
}

const repository = () => ({
  getDefinition: vi.fn().mockResolvedValue(definition),
  saveSuccess: vi.fn(),
  saveFailure: vi.fn(),
} as unknown as ControlRepository)

describe('control service', () => {
  it('publishes once before saving the expected value and success log', async () => {
    const repo = repository()
    const publish = vi.fn()
    const service = createControlService(repo, { publish })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 23,
      value: true,
    })).resolves.toEqual({ configId: 23, value: 'on', status: 'published' })

    expect(publish).toHaveBeenCalledOnce()
    expect(repo.saveSuccess).toHaveBeenCalledOnce()
    expect(repo.saveFailure).not.toHaveBeenCalled()
  })

  it('records a failed publish without saving the expected value', async () => {
    const repo = repository()
    const service = createControlService(repo, {
      publish: vi.fn().mockRejectedValue(new Error('MQTT 当前未连接')),
    })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 23,
      value: true,
    })).rejects.toMatchObject({ status: 503 })
    expect(repo.saveFailure).toHaveBeenCalledOnce()
    expect(repo.saveSuccess).not.toHaveBeenCalled()
  })

  it('rejects heater start before publishing', async () => {
    const repo = repository()
    vi.mocked(repo.getDefinition).mockResolvedValue({
      ...definition,
      configId: 24,
      topic: 'heater',
    })
    const publish = vi.fn()
    const service = createControlService(repo, { publish })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 24,
      value: 'on',
    })).rejects.toMatchObject({ status: 409 })
    expect(publish).not.toHaveBeenCalled()
  })

  it('validates configured numeric ranges and choices', async () => {
    const repo = repository()
    const publish = vi.fn()
    const service = createControlService(repo, { publish })

    vi.mocked(repo.getDefinition).mockResolvedValue({
      ...definition,
      fieldType: '3',
      min: '10',
      max: '20',
    })
    await expect(service.execute({
      deviceNumber: '202111',
      configId: 23,
      value: 21,
    })).rejects.toMatchObject({ status: 400 })

    vi.mocked(repo.getDefinition).mockResolvedValue({
      ...definition,
      fieldType: '5',
      options: [
        { label: '手动', value: 'manual' },
        { label: '自动', value: 'automatic' },
      ],
    })
    await expect(service.execute({
      deviceNumber: '202111',
      configId: 23,
      value: 'unknown',
    })).rejects.toMatchObject({ status: 400 })

    expect(publish).not.toHaveBeenCalled()
  })

  it('rejects unknown control types instead of guessing the input', async () => {
    const repo = repository()
    vi.mocked(repo.getDefinition).mockResolvedValue({
      ...definition,
      fieldType: '99',
    })
    const publish = vi.fn()
    const service = createControlService(repo, { publish })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 23,
      value: 'anything',
    })).rejects.toMatchObject({ status: 400 })
    expect(publish).not.toHaveBeenCalled()
  })
})
