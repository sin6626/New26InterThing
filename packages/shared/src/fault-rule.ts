export interface FaultRuleConfig {
  faultCode: string
  name: string
  category: 'safety' | 'diagnostic' | 'communication'
  protectionEnabled: boolean
  protectionLocked: boolean
  recordEnabled: boolean
  notificationEnabled: boolean
}

export interface UpdateFaultRuleConfig {
  protectionEnabled: boolean
  recordEnabled: boolean
  notificationEnabled: boolean
}
