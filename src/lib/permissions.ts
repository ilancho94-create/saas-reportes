export type Module = 'dashboard' | 'ventas' | 'labor' | 'food_cost' | 'costo_uso' | 
  'waste' | 'avt' | 'compras' | 'historial' | 'upload' | 'settings' | 'users' | 'employee' | 'kitchen'

export type Action = 'view' | 'edit' | 'create'

export const ROLE_PERMISSIONS: Record<string, Record<Module, Action[]>> = {
  admin: {
    dashboard: ['view'], ventas: ['view'], labor: ['view'], food_cost: ['view'],
    costo_uso: ['view', 'edit'], waste: ['view'], avt: ['view', 'edit'], compras: ['view'],
    historial: ['view'], upload: [], settings: ['view', 'edit'],
    users: ['view', 'edit', 'create'], employee: ['view'], kitchen: ['view']
  },
  owner: {
    dashboard: ['view'], ventas: ['view'], labor: ['view'], food_cost: ['view'],
    costo_uso: ['view', 'edit'], waste: ['view'], avt: ['view', 'edit'], compras: ['view'],
    historial: [], upload: [], settings: ['view', 'edit'],
    users: ['view', 'edit', 'create'], employee: ['view'], kitchen: ['view']
  },
  gm: {
    dashboard: ['view'], ventas: ['view'], labor: ['view'], food_cost: ['view'],
    costo_uso: ['view'], waste: ['view'], avt: ['view', 'edit'], compras: ['view'],
    historial: [], upload: [], settings: [],
    users: ['view'], employee: ['view'], kitchen: ['view']
  },
  manager: {
    dashboard: ['view'], ventas: ['view'], labor: ['view'], food_cost: ['view'],
    costo_uso: ['view'], waste: ['view'], avt: ['view', 'edit'], compras: ['view'],
    historial: [], upload: [], settings: [],
    users: [], employee: ['view'], kitchen: ['view']
  },
  chef: {
    dashboard: ['view'], ventas: [], labor: [], food_cost: ['view'],
    costo_uso: ['view'], waste: ['view', 'edit'], avt: ['view', 'edit'], compras: ['view'],
    historial: [], upload: [], settings: [],
    users: [], employee: [], kitchen: ['view']
  },
  supervisor: {
    dashboard: ['view'], ventas: ['view'], labor: ['view'], food_cost: [],
    costo_uso: [], waste: ['view'], avt: ['view'], compras: [],
    historial: [], upload: [], settings: [],
    users: [], employee: [], kitchen: ['view']
  },
}

export function can(role: string, module: Module, action: Action, customPermissions?: any): boolean {
  if (customPermissions?.[module]) {
    return customPermissions[module].includes(action)
  }
  return ROLE_PERMISSIONS[role]?.[module]?.includes(action) ?? false
}