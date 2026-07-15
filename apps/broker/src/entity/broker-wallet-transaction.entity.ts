import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class BrokerWalletTransactionEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  brokerId!: string;

  @Column()
  brokerCode!: string;

  @Column()
  type!: string;

  @Column()
  amount!: number;

  @Column()
  balanceAfter!: number;

  @Column()
  referenceNumber?: string;

  @Column()
  transactionCode?: string;

  @Column()
  reason!: string;

  @Column()
  createdBy!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
