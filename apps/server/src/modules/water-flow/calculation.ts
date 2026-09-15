/** L/min 与管径毫米换算为管内流速 m/s。 */
export const calculateVelocity = (
  flowLitersPerMinute: number,
  diameterMillimeters: number,
) => {
  const diameterMeters = diameterMillimeters / 1_000
  const area = Math.PI * diameterMeters ** 2 / 4
  return flowLitersPerMinute / 60_000 / area
}

/** 相邻有效读数按梯形积分为升数。 */
export const calculateVolumeIncrement = (
  previousFlowLitersPerMinute: number,
  currentFlowLitersPerMinute: number,
  elapsedSeconds: number,
) => (
  (previousFlowLitersPerMinute + currentFlowLitersPerMinute) / 2
) * elapsedSeconds / 60
