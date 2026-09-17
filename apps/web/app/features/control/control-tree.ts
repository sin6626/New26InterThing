import type { ControlField } from '@new26interthing/shared'

export interface ControlTreeNode extends ControlField {
  children: ControlTreeNode[]
}

/** 用后端自动状态同步控制树中的 master，避免安全停机后仍显示为开启。 */
export const syncAutomaticModeField = (
  fields: ControlField[],
  enabled: boolean,
) => {
  const master = fields.find(field => field.topic === 'master')
  if (master) master.value = enabled ? 'on' : 'off'
}

/** 保存期间禁用全部控件；故障锁定期间额外禁止重新开启自动模式。 */
export const isControlFieldDisabled = (
  field: ControlField,
  savingId: number | undefined,
  safetyLocked: boolean,
) => savingId !== undefined || (field.topic === 'master' && safetyLocked)

/** 按 id/ref_id 组装控制项层级，并根据父开关值隐藏当前无效的子项。 */
export const buildVisibleControlTree = (
  fields: ControlField[],
): ControlTreeNode[] => {
  const childrenByParent = new Map<number | null, ControlField[]>()
  for (const field of fields) {
    const siblings = childrenByParent.get(field.parentId) ?? []
    siblings.push(field)
    childrenByParent.set(field.parentId, siblings)
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.configId - right.configId)
  }

  const buildChildren = (
    parent: ControlField,
    ancestors: Set<number>,
  ): ControlTreeNode[] => (childrenByParent.get(parent.configId) ?? [])
    .filter(field => field.parentValue === null || field.parentValue === parent.value)
    .filter(field => !ancestors.has(field.configId))
    .map((field) => {
      const nextAncestors = new Set(ancestors)
      nextAncestors.add(field.configId)
      return {
        ...field,
        children: buildChildren(field, nextAncestors),
      }
    })

  return (childrenByParent.get(null) ?? []).map(field => ({
    ...field,
    children: buildChildren(field, new Set([field.configId])),
  }))
}
