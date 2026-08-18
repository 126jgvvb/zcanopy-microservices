import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class BrokerWalletTransactionEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  brokerId!: string;

  @Column()
  brokerCode!: string;

@Column({default:''})
  brokerId!: string;

  @Column({default:''})
  brokerCode!: string;

  @Column({default:''})
  type!: string;

  @Column({default:0})
  amount!: number;

  @Column({default:0})
  balanceAfter!: number;

  @Column({default:''})
  reason!: string;

  @Column({default:''})
  createdBy!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
