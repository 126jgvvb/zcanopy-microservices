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

  @Column({ type: 'json', nullable: true })
  monthlyIncome!: any[];

  @Column({ type: 'numeric', default: 0 })
  currentCommission!:number;

  @Column({ type: 'numeric', default: 0 })
  platformCommission!:number;

  @Column({ type: 'numeric', default: 0 })
  bookingCommission!:number;

  @Column({ type: 'numeric', default: 10000 })
  minimumWithdrawal!:number;

  @Column({ type: 'json', nullable: true })
  systemMessages!:SystemMessage[];

  @Column({ type: 'json', nullable: true })
  clientMessages!:any[];

  @Column({ type: 'json', nullable: true })
  sentMessages!:any[];

 @Column({ type: 'simple-array', nullable: true })
 deletedInvoiceIds!: string[];

 @Column({ type: 'date', default: new Date() })
 updatedAt!:Date
}


