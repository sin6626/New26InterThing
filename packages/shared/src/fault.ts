export interface FaultItem { id: number; deviceNumber: string | null; errorNumber: string | null; type: string | null; message: string | null; occurredAt: string | null }
export interface FaultTypeOption { value: string; label: string }
export interface FaultOptions { deviceNumbers: string[]; types: FaultTypeOption[] }
export interface FaultQuery { page: number; pageSize: number; deviceNumber?: string; type?: string; startTime?: string; endTime?: string }
export interface PaginatedFaults { items: FaultItem[]; total: number; page: number; pageSize: number }
export interface FaultStatisticsItem { type: string | null; label: string; count: number }
