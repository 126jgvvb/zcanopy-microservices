import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class SupportMessageEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  customerEmail!: string;

  @Column({ nullable: true })
  subject?: string;

  @Column({ type: 'text', nullable: true })
  textContent?: string;

  @Column({ type: 'text', nullable: true })
  htmlContent?: string;

  @Column()
  recipientInbox!: string;

  @Column({ default: 'pending' })
  status!: string;

  @CreateDateColumn()
  receivedAt!: Date;
}
