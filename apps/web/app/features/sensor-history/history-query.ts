/** 单设备页面隐藏了设备选择器，因此空状态必须回退到可用设备。 */
export const resolveHistoryDeviceNumber = (
  selectedDeviceNumber: string,
  availableDeviceNumbers: string[],
) => selectedDeviceNumber || availableDeviceNumbers[0] || ''
