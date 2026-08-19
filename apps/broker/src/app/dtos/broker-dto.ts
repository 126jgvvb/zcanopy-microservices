export class BrokerDto {
    username!:string;
    title!:string;
    email!:string;
    IDFront!:string;
    IDBack!:string;
    phoneNumber!:string;
    emailOtp?:string;
    phoneOtp?:string;
    subscriptionTier?:string;
}

export class RequestOtpDto {
    email!:string;
    phoneNumber!:string;
    username?:string;
}

export class ResendOtpDto {
    email?:string;
    phoneNumber?:string;
    channel?:'email'|'phone';
}

export class LoginBrokerDto {
    brokerCode?:string;
    password?:string;
    deviceId?:string;
    googleId?:string;
}

export class CreateBrokerSessionDto {
    brokerCode!:string;
    deviceId!:string;
    ttlSeconds?:number;
}

export class GetBrokerSessionsDto {
    brokerCode!:string;
}

export class RevokeBrokerSessionDto {
    brokerCode!:string;
    sessionId!:string;
}

export class GetBrokerByCodeDto {
    brokerCode!:string;
}

export class UpdateBrokerSettingsDto {
    brokerCode!:string;
    bookingNotificationsEnabled!:boolean;
}

export class GetAvailableTiersDto {
}

export class SubmitBrokerFeedbackDto {
    brokerCode!: string;
    email!: string;
    phone!: string;
    content!: string;
}

export class GetBrokerMessagesDto {
    brokerId!: string;
}

export class LogoutBrokerDto {
    brokerCode!: string;
    sessionId?: string;
}

export class RequestUnsubscribeOtpDto {
    brokerCode!: string;
}

export class UnsubscribeBrokerDto {
    brokerCode!: string;
    password?: string;
    googleId?: string;
    sessionId?: string;
    emailOtp!: string;
}

export class SetupBrokerAccountDto {
    brokerCode!: string;
    password!: string;
    deviceId!: string;
    brokerBrandName?: string;
}

export class ValidateBrokerDto {
  email!: string;
  password!: string;
}

export class GetBrokerByIdDto {
  id!: string;
}

export class SearchBrokersDto {
  query!: string;
}

export class SaveUserInfoDto {
  userId!: string;
  username?: string;
  email?: string;
  phoneNumber?: string;
  photoURL?: string;
  accountType?: string;
}

export class UpdateUserFieldDto {
  id!: number;
  fields!: Record<string, string>;
}

export class RegisterBrokerDto {
  fullName!: string;
  email!: string;
  phoneNumber!: string;
  idFrontUrl?: string;
  idBackUrl?: string;
}

export class SendBrokerOtpDto {
  email!: string;
  phoneNumber!: string;
}

export class VerifyBrokerOtpDto {
  email!: string;
  phoneNumber!: string;
  emailCode!: string;
  phoneCode!: string;
}

export class GetFeaturedPropertiesDto {
  limit?: number;
}
