import {Entity, Column,PrimaryGeneratedColumn} from 'typeorm';

export interface BrokerMessage {
  senderName?: string;
  senderPhone?: string;
  message?: string;
  sentAt?: string;
  read?: boolean;
  type?: string;
}

export interface BrokerBooking {
  id?: string;
  propertyId?: string;
  propertyTitle?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  date?: string;
  status?: string;
  amount?: number;
  transactionCode?: string;
}

@Entity()
export class BrokerEntity{
 @PrimaryGeneratedColumn()
 id!:string;

  @Column()
  username!:string;

  @Column()
  title!:string;

  @Column()
  email!: string;

 @Column()
 phoneNumber!: string;

 @Column()
 password!: string;

 @Column()
 createdAt!: Date;

 @Column()
 updatedAt!: Date;

 @Column()
 deletedAt!: Date;

 @Column()
 isActive!: boolean;

 @Column()
 isDeleted!: boolean;

 @Column()
 isVerified!: boolean;

 @Column()
 isEmailVerified!: boolean;

 @Column()
 isPhoneVerified!: boolean;

 @Column()
 bookings!: BrokerBooking[];

 @Column()
 messages!: BrokerMessage[];

 @Column()
 location!:string;

 @Column()
 lastLogin!:Date;

 @Column()
 brokerCode!:string;

 @Column()
 subscriptionTier!:string;

 @Column()
 maxProperties!:number;

 @Column()
 maxPhotosPerProperty!:number;

 @Column()
 maxVideosPerProperty!:number;

 @Column()
 maxVideoSizeMB!:number;

 @Column()
 paymentProofCode!:string;

 @Column()
 ninImages!: string[];

 @Column()
 brokerImage!:string;

  @Column()
  walletBalance!:number;

  @Column({ nullable: true })
  googleId?:string;

  @Column({ nullable: true })
  deviceId?:string;

  @Column({ nullable: true })
  currentSessionId?:string;

  @Column({ nullable: true })
  recentSearches?:string;

  @Column({ default: true })
  bookingNotificationsEnabled?:boolean;

  @Column({ nullable: true })
  subscriptionExpiresAt?: Date | null;

}


