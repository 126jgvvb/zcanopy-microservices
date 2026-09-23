import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { CustomerEntity } from './customer.entity';

@Entity('customer_otps')
export class CustomerOtpEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  otpCode!: string;

  @Column({ default: 'email' })
  channel!: string;

  @Column({ default: false })
  isUsed!: boolean;

  @Column({ default: false })
  isVerified!: boolean;

  @Column({ nullable: true })
  ipAddress!: string;

  @Column({ nullable: true })
  userAgent!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => CustomerEntity, customer => customer.otps, { onDelete: 'CASCADE' })
  customer!: CustomerEntity;

  @Column({ nullable: true })
  customerId!: string;
}
