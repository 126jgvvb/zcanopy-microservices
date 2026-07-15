import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AdminEntity } from './admin.entity';

@Entity()
export class AdminMessageEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  adminId!: string;

  @Column()
  adminUsername!: string;

  @Column()
  recipientType!: string;

  @Column()
  recipientPhone?: string;

  @Column()
  recipientEmail?: string;

  @Column()
  recipientName?: string;

  @Column()
  messageType!: string;

  @Column()
  subject?: string;

  @Column()
  body!: string;

  @Column()
  channel!: string;

  @Column()
  status!: string;

  @Column()
  errorMessage?: string;

  @CreateDateColumn()
  sentAt!: Date;

  @ManyToOne(() => AdminEntity, { eager: false })
  @JoinColumn({ name: 'adminId', referencedColumnName: 'id' })
  admin?: AdminEntity;
}
