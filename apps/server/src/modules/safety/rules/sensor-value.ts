/** 设备端约定：6000 及以上的传感器数值表示探头断线；0 仍是真实有效读数。 */
export const isValidSensorValue = (value: number) => (
  Number.isFinite(value) && value < 6_000
)
