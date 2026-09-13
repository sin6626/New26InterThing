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

const allowSafety = () => ({
  setEnabled: vi.fn(),
  authorizeAction: vi.fn().mockResolvedValue({ allowed: true, reason: null }),
})

describe('control service', () => {
  it('fails closed when a device command has no safety controller', async () => {
    const repo = repository()
    const publish = vi.fn()
    const service = createControlService(repo, { publish })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 23,
      value: 'on',
    })).rejects.toMatchObject({
      status: 503,
      message: '安全控制服务尚未初始化',
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it('publishes once before saving the expected value and success log', async () => {
    const repo = repository()
    const publish = vi.fn()
    const service = createControlService(repo, { publish }, allowSafety())

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
    const recordCommandFailure = vi.fn()
    const service = createControlService(repo, {
      publish: vi.fn().mockRejectedValue(new Error('MQTT 当前未连接')),
    }, {
      setEnabled: vi.fn(),
      authorizeAction: vi.fn().mockResolvedValue({ allowed: true, reason: null }),
      recordCommandFailure,
    })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 23,
      value: true,
    })).rejects.toMatchObject({ status: 503 })
    expect(repo.saveFailure).toHaveBeenCalledOnce()
    expect(repo.saveSuccess).not.toHaveBeenCalled()
    expect(recordCommandFailure).toHaveBeenCalledWith(
      '202111',
      { topic: 'pump', value: 'on' },
      'MQTT 当前未连接',
    )
  })

  it('still trips command safety when writing the failure log also fails', async () => {
    const repo = repository()
    vi.mocked(repo.saveFailure).mockRejectedValue(new Error('数据库不可用'))
    const recordCommandFailure = vi.fn().mockResolvedValue(undefined)
    const service = createControlService(repo, {
      publish: vi.fn().mockRejectedValue(new Error('MQTT 当前未连接')),
    }, {
      setEnabled: vi.fn(),
      authorizeAction: vi.fn().mockResolvedValue({ allowed: true, reason: null }),
      recordCommandFailure,
    })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 23,
      value: true,
    })).rejects.toMatchObject({ status: 503, message: 'MQTT 当前未连接' })
    expect(recordCommandFailure).toHaveBeenCalledOnce()
  })

  it('saves state-machine parameters without publishing MQTT', async () => {
    const repo = repository()
    vi.mocked(repo.getDefinition).mockResolvedValue({
      ...definition,
      configId: 10,
      fieldType: '2',
      topic: 'target_temperature',
      publishTopic: 'device/direct',
      payloadTemplate: null,
      valueMap: null,
      oldValue: '30',
    })
    const publish = vi.fn()
    const service = createControlService(repo, { publish })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 10,
      value: '35',
    })).resolves.toEqual({
      configId: 10,
      value: '35',
      status: 'saved',
    })

    expect(publish).not.toHaveBeenCalled()
    expect(repo.saveSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'target_temperature' }),
      '202111',
      '35',
      '应用层配置保存（无需MQTT下发）',
    )
  })

  it('delegates master to the automation engine without publishing master MQTT', async () => {
    const repo = repository()
    vi.mocked(repo.getDefinition).mockResolvedValue({
      ...definition,
      configId: 1,
      topic: 'master',
    })
    const publish = vi.fn()
    const setEnabled = vi.fn()
    const service = createControlService(
      repo,
      { publish },
      { setEnabled },
    )

    await service.execute({
      deviceNumber: '202111',
      configId: 1,
      value: 'on',
    })

    expect(setEnabled).toHaveBeenCalledWith('202111', true)
    expect(publish).not.toHaveBeenCalled()
    expect(repo.saveSuccess).toHaveBeenCalledOnce()
  })

  it('returns the automation rejection as a visible control conflict', async () => {
    const repo = repository()
    vi.mocked(repo.getDefinition).mockResolvedValue({
      ...definition,
      configId: 1,
      topic: 'master',
    })
    const service = createControlService(
      repo,
      { publish: vi.fn() },
      {
        setEnabled: vi.fn().mockRejectedValue(
          new Error('最近传感器数据不可用，无法启动自动模式'),
        ),
      },
    )

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 1,
      value: 'on',
    })).rejects.toMatchObject({
      message: '最近传感器数据不可用，无法启动自动模式',
      status: 409,
    })
  })

  it('rejects heater start when the shared safety gate denies it', async () => {
    const repo = repository()
    vi.mocked(repo.getDefinition).mockResolvedValue({
      ...definition,
      configId: 24,
      topic: 'heater',
    })
    const publish = vi.fn()
    const service = createControlService(repo, { publish }, {
      setEnabled: vi.fn(),
      authorizeAction: vi.fn().mockResolvedValue({
        allowed: false,
        reason: '设备实际水泵尚未开启',
      }),
    })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 24,
      value: 'on',
    })).rejects.toMatchObject({
      status: 409,
      message: '设备实际水泵尚未开启',
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it('publishes heater start when the shared safety gate allows it', async () => {
    const repo = repository()
    vi.mocked(repo.getDefinition).mockResolvedValue({
      ...definition,
      configId: 24,
      topic: 'heater',
    })
    const publish = vi.fn()
    const recordCommand = vi.fn()
    const service = createControlService(repo, { publish }, {
      setEnabled: vi.fn(),
      authorizeAction: vi.fn().mockResolvedValue({ allowed: true, reason: null }),
      recordCommand,
    })

    await expect(service.execute({
      deviceNumber: '202111',
      configId: 24,
      value: 'on',
    })).resolves.toMatchObject({ status: 'published' })
    expect(publish).toHaveBeenCalledOnce()
    expect(recordCommand).toHaveBeenCalledWith('202111', {
      topic: 'heater',
      value: 'on',
    })
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
