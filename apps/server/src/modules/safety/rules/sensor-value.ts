/** 设备端约定：600 及以上是 0xFFFF 经不同小数位换算后的断线值；0 仍是真实有效读数。 */
export const isValidSensorValue = (value: number) => (
  Number.isFinite(value) && value < 600
)
