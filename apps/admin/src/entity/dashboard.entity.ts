import {Entity, Column, PrimaryGeneratedColumn} from 'typeorm';

/**
 * A single message shown on the admin dashboard feed (systemMessages).
 */
export interface SystemMessage {
  type: string;        // e.g. 'BROKER_SIGNUP'
  title: string;
  message: string;
  brokerId?: string;
  read: boolean;
  createdAt: string;   // ISO date string
}

@Entity()
export class DashaordEntity{
 @PrimaryGeneratedColumn()
 id!:string;

 @Column()
 monthlyIncome!:any[];

 @Column()
 currentCommission!:number;

  @Column()
  platformCommission!:number;

  @Column()
  bookingCommission!:number;

  @Column()
  minimumWithdrawal!:number;

  @Column()
  systemMessages!:SystemMessage[];

 @Column()
 clientMessages!:any[];

 @Column()
 sentMessages!:any[];

 @Column()
 updatedAt!:Date
}


