export interface ApiSuccessResponse<T> { code: 0; message: string; data: T }
export interface ApiErrorResponse { code: number; message: string; data: null }
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse
