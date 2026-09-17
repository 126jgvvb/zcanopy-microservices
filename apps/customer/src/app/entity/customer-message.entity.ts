import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { CustomerEntity } from './customer.entity';

@Entity('customer_messages')
export class CustomerMessageEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  subject!: string;

  @Column('text')
  body!: string;

  @Column({ default: 'support' })
  source!: string;

  @Column({ nullable: true })
  attachmentUrl!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => CustomerEntity, customer => customer.messages, { onDelete: 'CASCADE' })
  customer!: CustomerEntity;

  @Column()
  customerId!: string;
}
