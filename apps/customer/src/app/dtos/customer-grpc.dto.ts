export interface RegisterCustomerDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

export interface LoginCustomerDto {
  email: string;
  password: string;
}

export interface LoginCustomerGoogleDto {
  googleId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface ConfirmOtpDto {
  email: string;
  otpCode: string;
}

export interface UpdatePhoneDto {
  customerId: string;
  phoneNumber: string;
}

export interface GetProfileDto {
  customerId: string;
}

export interface GetWalletBalanceDto {
  customerId: string;
}

export interface LogoutDto {
  customerId: string;
}

export interface UnsubscribeDto {
  customerId: string;
}

export interface GetInvoicesDto {
  customerId: string;
  page: number;
  limit: number;
}

export interface GetTransactionsDto {
  customerId: string;
  page: number;
  limit: number;
}

export interface GetMessagesDto {
  customerId: string;
  page: number;
  limit: number;
}

export interface GetNotificationsDto {
  customerId: string;
  page: number;
  limit: number;
}

export interface InitiateTransactionDto {
  customerId: string;
  phoneNumber: string;
  email: string;
  customerName?: string;
  propertyId?: string;
  reason?: string;
  amount?: number;
}

export interface SearchQueryDto {
  customerId: string;
  query?: string;
  location?: string;
  radius?: number;
  propertyType?: string;
  subCounty?: string;
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export interface RecordSearchDto {
  customerId: string;
  query?: string;
  location?: string;
  radius?: number;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  subCounty?: string;
  district?: string;
  hadResults?: boolean;
  resultPropertyIds?: string[];
  resultCount?: number;
}

export interface GetCustomerSearchesDto {
  customerId: string;
  page: number;
  limit: number;
}

export interface VideoToursQueryDto {
  customerId: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  propertyType?: string;
  page: number;
  limit: number;
}

export interface AllPropertiesQueryDto {
  customerId: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  propertyType?: string;
  page: number;
  limit: number;
}

export interface ExplorerQueryDto {
  customerId: string;
  page: number;
  limit: number;
}

export interface GetPropertyDetailsDto {
  customerId: string;
  propertyId: string;
}

export interface SimilarPropertiesQueryDto {
  customerId: string;
  propertyId: string;
  page: number;
  limit: number;
}

export interface GetAllCustomersDto {
  page: number;
  limit: number;
  isActive?: boolean;
}