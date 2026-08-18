import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class CustomerPropertyAccessEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  sessionToken!: string;

@Column({default:''})
  sessionToken!: string;

  @Column({default:''})
  brokerCode!: string;

  @Column({default:''})
  paymentStatus!: string;

  @Column({default:0})
  amount!: number;

  @Column({ nullable: true })
  transactionCode?: string;

  @Column({ nullable: true })
  transactionId?: string;

  @Column({ nullable: true })
  customerEmail?: string;

  @Column({ nullable: true })
  customerPhone?: string;

  @Column({ nullable: true })
  customerName?: string;

  @Column({ type: 'text', nullable: true })
  careerExamples?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
