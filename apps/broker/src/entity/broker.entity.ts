import {Entity, Column, PrimaryColumn, BeforeInsert} from 'typeorm';

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
  @PrimaryColumn({ type: 'varchar', length: 6 })
  id!: string;

  @Column({default: 'delos-broker'})
  username!:string;

  @Column({default: 'Delos Broker'})
  title!:string;

  @Column({default: 'delos-broker@gmail.com'})
  email!: string;

  @Column({default: '+2348123456789'})
  phoneNumber!: string;

  @Column({default: 'password'})
  password!: string;

  @Column({default: new Date()})
  createdAt!: Date;

  @Column({default: new Date()})
  updatedAt!: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      // Generate a 6-digit numeric ID
      this.id = Math.floor(100000 + Math.random() * 900000).toString();
    }
  }

 @Column({default: new Date()})
 deletedAt!: Date;

 @Column({default: true})
 isActive!: boolean;

 @Column({default: false})
 isDeleted!: boolean;

 @Column({default: false})
 isVerified!: boolean;

 @Column({default: false})
 isEmailVerified!: boolean;

 @Column({default: false})
 isPhoneVerified!: boolean;

  @Column({ type: 'json', nullable: true })
  bookings!: BrokerBooking[];

  @Column({ type: 'json', nullable: true })
  messages!: BrokerMessage[];

 @Column({default: 'kirinya'})
 location!:string;

 @Column({default: new Date()})
 lastLogin!:Date;

 @Column({default: 'DELOS-BROKER-001'})
 brokerCode!:string;

@Column({default: 'prop'})
subscriptionTier!:string;

 @Column({default: 10})
 maxProperties!:number;

 @Column({default: 10})
 maxPhotosPerProperty!:number;

 @Column({default: 10})
 maxVideosPerProperty!:number;

 @Column({default: 50})
 maxVideoSizeMB!:number;

 @Column({default: 'DELOS-BROKER-001'})
 paymentProofCode!:string;

  @Column({ type: 'json', nullable: true })
  ninImages!: string[];

 @Column({default: 'https://delos.com/broker/image.jpg'})
 brokerImage!:string;

  @Column({default: 0})
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

  @Column({ type: 'timestamp', nullable: true })
  subscriptionExpiresAt?: Date | null;

  @Column({ nullable: true })
  brokerBrandName?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ nullable: true })
  legalName?: string;

  @Column({ nullable: true })
  idNumber?: string;

  @Column({ nullable: true })
  idFrontUrl?: string;

  @Column({ nullable: true })
  idBackUrl?: string;

}


